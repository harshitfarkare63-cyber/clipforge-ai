/**
 * ClipForge AI — AI Analyzer Service (Powered by Google Gemini)
 *
 * Pipeline:
 *  1. Extract audio from video (FFmpeg → MP3)
 *  2. Upload audio to Gemini File API
 *  3. Gemini 1.5 Flash transcribes + detects viral hooks in ONE call
 *  4. Gemini Flash generates clip metadata (titles, hashtags, captions)
 */

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { configureFfmpeg } = require('../utils/ffmpeg-resolver');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Configure FFmpeg (uses bundled ffmpeg-static)
configureFfmpeg();

// ── Gemini Client (lazy init) ─────────────────────────────────
let _genai = null;
function getGenAI() {
    if (!_genai) {
        _genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return _genai;
}

const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ── Extract audio from video ──────────────────────────────────
function extractAudio(videoPath, audioPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions([
                '-vn',               // no video
                '-acodec', 'libmp3lame',
                '-ar', '16000',      // 16kHz — enough for speech
                '-ac', '1',          // mono
                '-b:a', '64k',
            ])
            .save(audioPath)
            .on('end', resolve)
            .on('error', reject);
    });
}

// ── Upload audio to Gemini File API ──────────────────────────
async function uploadAudioToGemini(audioPath) {
    const { GoogleAIFileManager } = require('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

    console.log('[Analyzer] Uploading to Gemini File API...');
    const { file } = await fileManager.uploadFile(audioPath, {
        mimeType: 'audio/mpeg',
        displayName: path.basename(audioPath),
    });

    console.log(`[Analyzer] File uploaded → name:${file.name} state:${file.state} uri:${file.uri}`);

    // For short audio (< 10min), state is already ACTIVE after upload
    // If still PROCESSING, wait briefly — do NOT call getFile (causes 404 on some SDK versions)
    if (file.state === 'PROCESSING') {
        console.log('[Analyzer] File processing, waiting 5s...');
        await delay(5000);
    }

    // Use the URI directly from the upload response
    return {
        fileData: {
            fileUri: file.uri,
            mimeType: file.mimeType || 'audio/mpeg',
        }
    };
}

// Model fallback chain — tries each model until one works
const GEMINI_MODELS = [
    'gemini-2.0-flash-lite',   // highest free quota
    'gemini-2.0-flash',
    'gemini-2.5-flash',
];

async function callGeminiWithFallback(buildRequestFn) {
    for (const modelName of GEMINI_MODELS) {
        try {
            console.log(`[Analyzer] Trying model: ${modelName}`);
            const model = getGenAI().getGenerativeModel({
                model: modelName,
                safetySettings: SAFETY_SETTINGS,
            });
            return await buildRequestFn(model);
        } catch (err) {
            const is429 = err.status === 429 || err.message?.includes('429') || err.message?.includes('quota');
            const isNotFound = err.status === 404 || err.message?.includes('not found');
            if (is429 || isNotFound) {
                console.warn(`[Analyzer] ${modelName} failed (${is429 ? '429 quota' : '404 not found'}), trying next...`);
                continue;
            }
            throw err; // non-quota error, propagate
        }
    }
    throw new Error('All Gemini models quota exceeded. Please wait a few minutes and try again.');
}

// ── Transcribe + detect viral hooks with Gemini ───────────────
async function transcribeAndDetectHooks(audioPart, videoDuration) {

    const prompt = `You are a viral short-form video expert. I will give you an audio track from a long video.

Your tasks:
1. TRANSCRIBE the audio completely with timestamps (every ~5 seconds, format: [MM:SS])
2. FIND the top 5 most viral-worthy segments (15–60 seconds each)

For each clip, return:
- start_sec: start time in seconds (number)
- end_sec: end time in seconds (number, max ${videoDuration})
- title: catchy title (max 8 words)
- hook: the opening hook line the viewer hears
- reason: why this is viral-worthy
- engagementScore: 1–100 virality prediction
- viralType: one of [educational, emotional, funny, inspiring, shocking, controversial]
- transcript: the words spoken in this segment

Rules:
- Clips must NOT overlap
- Clips must be 15–60 seconds
- Prioritize: hooks, surprises, strong emotions, humor, controversial takes
- The very first word/phrase must hook the viewer immediately

Respond ONLY with valid JSON:
{
  "transcript": "full transcript with [MM:SS] timestamps...",
  "clips": [
    { "start_sec": 12, "end_sec": 45, "title": "...", "hook": "...", "reason": "...", "engagementScore": 92, "viralType": "educational", "transcript": "..." }
  ]
}`;

    const result = await callGeminiWithFallback(model => model.generateContent({
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                { fileData: audioPart.fileData },
            ],
        }],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
        },
    }));

    const text = result.response.text();
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Gemini returned invalid JSON: ' + text.slice(0, 200));
    }
}

// ── Generate clip metadata with Gemini Flash ──────────────
async function generateClipMetadata(clip) {
    const prompt = `For this viral video clip:
Title: "${clip.title}"
Type: ${clip.viralType}
Transcript: "${clip.transcript || clip.hook}"

Generate:
1. 3 punchy viral title variations (emotional, clickbait, curiosity-driven)
2. 10 trending hashtags for TikTok/Reels/Shorts
3. A hook caption under 100 characters

Respond with JSON:
{
  "titles": ["title1", "title2", "title3"],
  "hashtags": ["#tag1", "#tag2", ...],
  "caption": "short hook caption"
}`;

    try {
        const result = await callGeminiWithFallback(model => model.generateContent(prompt));
        return JSON.parse(result.response.text());
    } catch {
        return { titles: [clip.title], hashtags: ['#viral', '#trending', '#shorts'], caption: clip.hook || '' };
    }
}

// ── Parse captions (word-level from transcript) ───────────────
function parseWordCaptions(transcriptText, startSec, endSec) {
    // Extract words from the clip's transcript and distribute timing evenly
    const words = (transcriptText || '').split(/\s+/).filter(Boolean);
    const duration = endSec - startSec;
    const timePerWord = duration / Math.max(words.length, 1);

    return words.map((word, i) => ({
        word,
        start: i * timePerWord,
        end: (i + 1) * timePerWord,
    }));
}

// ── MOCK ANALYZER (no Gemini key) ─────────────────────────────
function mockAnalyzer(videoDuration) {
    const templates = [
        { title: 'Mind-Blowing Fact You Never Knew', viralType: 'educational', engagementScore: 94 },
        { title: 'This Changed Everything', viralType: 'inspiring', engagementScore: 88 },
        { title: 'Wait For The Twist...', viralType: 'shocking', engagementScore: 91 },
        { title: "The Part Everyone's Talking About", viralType: 'controversial', engagementScore: 97 },
        { title: "You Won't Believe This Worked", viralType: 'funny', engagementScore: 85 },
    ];

    return templates.map((tpl, i) => {
        const start = Math.floor(Math.random() * (videoDuration * 0.5) + 10);
        const duration = Math.floor(Math.random() * 25 + 20);
        return {
            id: `clip_mock_${i}`,
            ...tpl,
            start,
            end: Math.min(start + duration, videoDuration - 1),
            hook: 'This is the part where everything changes...',
            reason: 'High engagement segment detected',
            transcript: 'Sample transcript for this clip segment.',
            captions: [],
            metadata: {
                titles: [tpl.title],
                hashtags: ['#viral', '#trending', '#shorts'],
                caption: tpl.title,
            },
        };
    });
}

// ── Main pipeline ─────────────────────────────────────────────
async function analyzeVideo(videoPath, videoDuration, onProgress) {
    const hasKey = process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here';

    if (!hasKey) {
        console.log('[Analyzer] No Gemini key — using mock analysis');
        if (onProgress) onProgress(30, 'Scanning video frames...');
        await delay(1500);
        if (onProgress) onProgress(65, 'Detecting engagement peaks...');
        await delay(1500);
        if (onProgress) onProgress(95, 'Ranking clips by virality...');
        await delay(700);
        if (onProgress) onProgress(100, 'Analysis complete!');
        return { clips: mockAnalyzer(videoDuration), usedMock: true };
    }

    console.log('[Analyzer] Using Gemini AI pipeline');
    const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.mp3');

    // Step 1: Extract audio
    if (onProgress) onProgress(8, 'Extracting audio...');
    await extractAudio(videoPath, audioPath);
    console.log('[Analyzer] Audio extracted:', audioPath, `(${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)}MB)`);

    // Step 2: Upload to Gemini File API
    if (onProgress) onProgress(22, 'Uploading audio to Gemini...');
    let audioPart;
    try {
        audioPart = await uploadAudioToGemini(audioPath);
    } catch (uploadErr) {
        console.error('[Analyzer] Upload error:', JSON.stringify(uploadErr, null, 2));
        throw uploadErr;
    } finally {
        fs.unlink(audioPath, () => { }); // always clean up temp
    }

    // Step 3: Gemini transcribes + finds viral clips in ONE call
    if (onProgress) onProgress(35, 'Gemini is analyzing your video...');
    console.log('[Analyzer] Calling Gemini 1.5 Flash with fileUri:', audioPart.fileData?.fileUri);
    let analysis;
    try {
        analysis = await transcribeAndDetectHooks(audioPart, videoDuration);
    } catch (geminiErr) {
        console.error('[Analyzer] Gemini error details:', JSON.stringify(geminiErr?.errorDetails || geminiErr?.message || geminiErr, null, 2));
        throw geminiErr;
    }
    console.log(`[Analyzer] Got ${analysis.clips?.length || 0} clips from Gemini`);


    if (onProgress) onProgress(80, 'Generating metadata for each clip...');

    // Step 4: Generate metadata for each clip
    const clips = await Promise.all((analysis.clips || []).map(async (clip, i) => {
        const metadata = await generateClipMetadata(clip).catch(() => ({
            titles: [clip.title], hashtags: [], caption: clip.hook || '',
        }));
        const captions = parseWordCaptions(clip.transcript, clip.start_sec || clip.start, clip.end_sec || clip.end);

        return {
            id: `clip_gemini_${i}`,
            title: clip.title,
            start: clip.start_sec || clip.start,
            end: clip.end_sec || clip.end,
            hook: clip.hook,
            reason: clip.reason,
            engagementScore: clip.engagementScore,
            viralType: clip.viralType,
            transcript: clip.transcript,
            captions,
            metadata,
        };
    }));

    if (onProgress) onProgress(100, 'Analysis complete!');
    return { clips, fullTranscript: analysis.transcript, usedMock: false };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { analyzeVideo, generateClipMetadata };
