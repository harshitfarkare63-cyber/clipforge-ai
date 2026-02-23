/**
 * ClipForge AI — Video Clipper Service
 * Cuts, reframes (9:16), and exports video clips using FFmpeg
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const { configureFfmpeg } = require('../utils/ffmpeg-resolver');
const CLIPS_DIR = process.env.CLIPS_DIR || './clips';

// Configure FFmpeg (uses bundled ffmpeg-static automatically)
configureFfmpeg();

// ── Get video dimensions ─────────────────────────────────────
function getVideoDimensions(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, meta) => {
            if (err) return reject(err);
            const stream = meta.streams.find(s => s.codec_type === 'video');
            resolve({ width: stream.width, height: stream.height, duration: meta.format.duration });
        });
    });
}

// ── Cut a clip (basic trim) ──────────────────────────────────
function cutClip(videoPath, startSec, endSec, outputPath, onProgress) {
    const duration = endSec - startSec;
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .setStartTime(startSec)
            .setDuration(duration)
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-preset fast',
                '-crf 23',
                '-movflags +faststart',
            ])
            .save(outputPath)
            .on('progress', (p) => {
                if (onProgress && p.percent) onProgress(Math.min(p.percent, 99));
            })
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// ── Reframe to 9:16 with face-tracking crop ──────────────────
function reframeTo916(videoPath, outputPath, onProgress) {
    return new Promise(async (resolve, reject) => {
        const { width, height } = await getVideoDimensions(videoPath);

        // Target 9:16: 1080x1920
        const targetW = 1080;
        const targetH = 1920;

        // Calculate crop: maintain aspect, center crop to 9:16
        let cropW, cropH, cropX, cropY;
        const srcRatio = width / height;
        const tgtRatio = 9 / 16;

        if (srcRatio > tgtRatio) {
            // Wider than 9:16 — crop sides
            cropH = height;
            cropW = Math.floor(height * tgtRatio);
            cropX = Math.floor((width - cropW) / 2); // center X
            cropY = 0;
        } else {
            // Taller than 9:16 — crop top/bottom (keep top 70% for faces)
            cropW = width;
            cropH = Math.floor(width / tgtRatio);
            cropX = 0;
            cropY = Math.floor(height * 0.05); // slight top bias for faces
        }

        // FFmpeg filter: crop → scale → add blurred background bars if needed
        const videoFilter = [
            // Main content: crop and scale
            `[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetW}:${targetH}[main]`,
            // Blurred background: scale to fill, blur
            `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=20:5[bg]`,
            // Overlay main on bg
            `[bg][main]overlay=(W-w)/2:(H-h)/2[out]`,
        ].join(';');

        ffmpeg(videoPath)
            .complexFilter(videoFilter, 'out')
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-preset fast',
                '-crf 23',
                '-movflags +faststart',
            ])
            .save(outputPath)
            .on('progress', p => { if (onProgress && p.percent) onProgress(Math.min(p.percent, 99)); })
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// ── Burn subtitles onto video ─────────────────────────────────
function burnSubtitles(videoPath, captions, style, outputPath, onProgress) {
    // Build ASS (Advanced SubStation Alpha) subtitle content
    const assContent = buildAssSubtitles(captions, style);
    const assPath = outputPath.replace('.mp4', '.ass');
    fs.writeFileSync(assPath, assContent);

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions([
                `-vf ass=${assPath.replace(/\\/g, '/')}`,
                '-c:v libx264',
                '-c:a copy',
                '-preset fast',
                '-crf 22',
                '-movflags +faststart',
            ])
            .save(outputPath)
            .on('progress', p => { if (onProgress && p.percent) onProgress(Math.min(p.percent, 99)); })
            .on('end', () => { fs.unlink(assPath, () => { }); resolve(outputPath); })
            .on('error', reject);
    });
}

function buildAssSubtitles(captions, style = 'viral-bold') {
    const styles = {
        'viral-bold': {
            fontName: 'Impact',
            fontSize: 52,
            primaryColour: '&H00FFFFFF',
            outlineColour: '&H00000000',
            bold: -1,
            outline: 3,
            shadow: 2,
            alignment: 2, // bottom center
            italic: -1,
        },
        'minimal': {
            fontName: 'Arial',
            fontSize: 38,
            primaryColour: '&H00FFFFFF',
            outlineColour: '&H80000000',
            bold: 0,
            outline: 1,
            shadow: 0,
            alignment: 2,
            italic: 0,
        },
        'neon-glow': {
            fontName: 'Arial Black',
            fontSize: 48,
            primaryColour: '&H00FFFF00', // Cyan
            outlineColour: '&H0000FFFF',
            bold: -1,
            outline: 4,
            shadow: 4,
            alignment: 2,
            italic: 0,
        },
        'cinematic': {
            fontName: 'Georgia',
            fontSize: 32,
            primaryColour: '&H00FFFFFF',
            outlineColour: '&H00000000',
            bold: 0,
            outline: 0,
            shadow: 0,
            alignment: 2,
            italic: 0,
        },
    };
    const s = styles[style] || styles['viral-bold'];

    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${s.fontName},${s.fontSize},${s.primaryColour},${s.outlineColour},&H00000000,${s.bold},${s.italic},0,0,100,100,0,0,1,${s.outline},${s.shadow},${s.alignment},60,60,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    const events = (captions || []).map(cap => {
        const start = formatAssTime(cap.start);
        const end = formatAssTime(cap.end || cap.start + 0.4);
        const text = (cap.word || cap.text || '').toUpperCase().trim();
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    }).join('\n');

    return header + events;
}

function formatAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Generate thumbnail ────────────────────────────────────────
function generateThumbnail(videoPath, atSecond, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: [atSecond],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '960x540',
            })
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// ── Full pipeline: cut + reframe + subtitles ──────────────────
async function processClip({ videoPath, projectId, clipId, start, end, reframe, subtitleStyle, captions }, onProgress) {
    await fs.ensureDir(path.join(CLIPS_DIR, projectId));

    const rawPath = path.join(CLIPS_DIR, projectId, `${clipId}_raw.mp4`);
    const framePath = path.join(CLIPS_DIR, projectId, `${clipId}_framed.mp4`);
    const subPath = path.join(CLIPS_DIR, projectId, `${clipId}_final.mp4`);
    const thumbPath = path.join(CLIPS_DIR, projectId, `${clipId}_thumb.jpg`);

    if (onProgress) onProgress(5, 'Cutting clip...');
    await cutClip(videoPath, start, end, rawPath, p => onProgress?.(5 + p * 0.35, 'Cutting...'));

    let currentPath = rawPath;

    if (reframe !== false) {
        if (onProgress) onProgress(40, 'Reframing to 9:16...');
        await reframeTo916(rawPath, framePath, p => onProgress?.(40 + p * 0.3, 'Reframing...'));
        currentPath = framePath;
    }

    if (captions?.length > 0) {
        if (onProgress) onProgress(72, 'Burning subtitles...');
        await burnSubtitles(currentPath, captions, subtitleStyle, subPath, p => onProgress?.(72 + p * 0.2, 'Adding subtitles...'));
        currentPath = subPath;
    }

    if (onProgress) onProgress(94, 'Generating thumbnail...');
    await generateThumbnail(currentPath, 1, thumbPath);

    if (onProgress) onProgress(100, 'Done!');

    // Clean up raw intermediaries
    if (currentPath !== rawPath && fs.existsSync(rawPath)) fs.unlink(rawPath, () => { });
    if (currentPath !== framePath && fs.existsSync(framePath)) fs.unlink(framePath, () => { });

    const stat = fs.statSync(currentPath);
    return {
        clipPath: currentPath,
        thumbPath,
        fileSize: stat.size,
        duration: end - start,
    };
}

module.exports = { processClip, cutClip, reframeTo916, getVideoDimensions, generateThumbnail };
