/**
 * ClipForge AI — Video Routes
 * POST /api/videos/info       — Get metadata for a URL
 * POST /api/videos/process    — Download + AI analyze + create clips
 * GET  /api/videos/:id        — Get project status + clips
 * GET  /api/videos            — List all projects
 * POST /api/videos/:id/cut    — Manual cut: create a clip from timestamps
 * PATCH /api/videos/:pid/clips/:cid — Update clip (title, style, times)
 * DELETE /api/videos/:pid/clips/:cid — Delete clip
 * POST /api/videos/:pid/clips/:cid/export — Export final clip (reframe + subtitles)
 * GET  /api/videos/:pid/clips/:cid/download — Download exported file
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const { isValidYouTubeUrl, getVideoInfo, downloadVideo } = require('../services/youtube');
const { analyzeVideo } = require('../services/analyzer');
const { processClip, getVideoDimensions } = require('../services/clipper');
const store = require('../store/projects');

const CLIPS_DIR = process.env.CLIPS_DIR || './clips';

// Track active SSE clients for streaming progress
const sseClients = new Map();
function sendProgress(projectId, data) {
    const client = sseClients.get(projectId);
    if (client && !client.writableEnded) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// ── GET /api/videos/progress/:id  (Server-Sent Events) ────────
router.get('/progress/:id', (req, res) => {
    const { id } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    sseClients.set(id, res);

    // Send current status immediately
    const project = store.getProject(id);
    if (project) {
        res.write(`data: ${JSON.stringify({ progress: project.progress, msg: project.progressMsg, status: project.status })}\n\n`);
    }

    req.on('close', () => sseClients.delete(id));
});

// ── POST /api/videos/info ─────────────────────────────────────
router.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube/Twitch URL' });

        const info = await getVideoInfo(url);

        if (info.duration > (process.env.MAX_VIDEO_DURATION_MINUTES || 120) * 60) {
            return res.status(400).json({ error: `Video too long. Max ${process.env.MAX_VIDEO_DURATION_MINUTES || 120} minutes.` });
        }

        res.json({ success: true, info });
    } catch (err) {
        console.error('[/info]', err.message);
        res.status(500).json({ error: 'Failed to fetch video info. Check the URL and try again.' });
    }
});

// ── POST /api/videos/process ──────────────────────────────────
router.post('/process', async (req, res) => {
    const { url, userId = 'anonymous' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

    // Create project immediately and return ID
    let videoInfo;
    try { videoInfo = await getVideoInfo(url); } catch { videoInfo = { title: 'New Project', duration: 0 }; }

    const project = store.createProject({ url, videoInfo, userId });
    res.status(202).json({ success: true, projectId: project.id, project });

    // ── Async pipeline (runs in background) ──────────────────────
    ; (async () => {
        function progress(pct, msg) {
            store.updateProject(project.id, { progress: pct, progressMsg: msg, status: 'processing' });
            sendProgress(project.id, { progress: pct, msg, status: 'processing' });
            console.log(`[${project.id}] ${pct}% — ${msg}`);
        }

        try {
            // 1) Download
            progress(2, 'Downloading video...');
            const videoPath = await downloadVideo(url, project.id, (pct) => {
                progress(Math.round(pct * 0.45), `Downloading... ${Math.round(pct)}%`);
            });
            store.updateProject(project.id, { videoPath });

            // 2) Get dimensions
            const { duration: videoDuration } = await getVideoDimensions(videoPath);

            // 3) AI Analysis
            progress(47, 'Starting AI analysis...');
            const { clips: detectedClips, usedMock } = await analyzeVideo(
                videoPath,
                videoDuration,
                (pct, msg) => progress(47 + Math.round(pct * 0.45), msg)
            );

            // 4) Save clips to project
            for (const clip of detectedClips) {
                store.addClipToProject(project.id, {
                    ...clip,
                    id: clip.id || uuidv4(),
                    status: 'ready',
                    exported: false,
                    reframe: true,
                    subtitleStyle: 'viral-bold',
                });
            }

            // Done
            store.updateProject(project.id, { status: 'completed', progress: 100, progressMsg: 'Done!' });
            sendProgress(project.id, {
                progress: 100,
                msg: `Analysis complete! Found ${detectedClips.length} viral clips${usedMock ? ' (mock mode)' : ''}.`,
                status: 'completed',
                clips: store.getProject(project.id).clips,
            });
        } catch (err) {
            console.error(`[pipeline:${project.id}]`, err);
            store.updateProject(project.id, { status: 'error', progressMsg: err.message });
            sendProgress(project.id, { progress: 0, msg: `Error: ${err.message}`, status: 'error' });
        }
    })();
});

// ── GET /api/videos ───────────────────────────────────────────
router.get('/', (req, res) => {
    const { userId } = req.query;
    const projects = store.getAllProjects(userId);
    res.json({ success: true, projects });
});

// ── GET /api/videos/:id ───────────────────────────────────────
router.get('/:id', (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, project });
});

// ── POST /api/videos/:id/cut  (manual cutting) ───────────────
router.post('/:id/cut', async (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.videoPath) return res.status(400).json({ error: 'Video not yet downloaded' });

    const { start, end, title = 'Manual Clip', subtitleStyle = 'viral-bold' } = req.body;

    if (start == null || end == null) return res.status(400).json({ error: 'start and end (seconds) are required' });
    if (end <= start) return res.status(400).json({ error: 'end must be after start' });
    if ((end - start) > 180) return res.status(400).json({ error: 'Clip max length is 3 minutes' });

    const clipId = uuidv4();
    const clip = store.addClipToProject(project.id, {
        id: clipId,
        title,
        start,
        end,
        status: 'ready',
        exported: false,
        reframe: true,
        subtitleStyle,
        viralType: 'manual',
        engagementScore: null,
    });

    res.status(201).json({ success: true, clip });
});

// ── PATCH /api/videos/:pid/clips/:cid ────────────────────────
router.patch('/:pid/clips/:cid', (req, res) => {
    const { title, start, end, reframe, subtitleStyle } = req.body;
    const updated = store.updateClip(req.params.pid, req.params.cid, { title, start, end, reframe, subtitleStyle });
    if (!updated) return res.status(404).json({ error: 'Clip not found' });
    res.json({ success: true, clip: updated });
});

// ── DELETE /api/videos/:pid/clips/:cid ───────────────────────
router.delete('/:pid/clips/:cid', (req, res) => {
    const deleted = store.deleteClip(req.params.pid, req.params.cid);
    if (!deleted) return res.status(404).json({ error: 'Clip not found' });
    res.json({ success: true });
});

// ── POST /api/videos/:pid/clips/:cid/export ──────────────────
router.post('/:pid/clips/:cid/export', async (req, res) => {
    const project = store.getProject(req.params.pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const clip = project.clips.find(c => c.id === req.params.cid);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    if (!project.videoPath) return res.status(400).json({ error: 'Source video not available' });

    // Update status
    store.updateClip(project.id, clip.id, { status: 'exporting', progress: 0 });
    res.json({ success: true, message: 'Export started', clipId: clip.id });

    // Background export
    ; (async () => {
        try {
            const result = await processClip({
                videoPath: project.videoPath,
                projectId: project.id,
                clipId: clip.id,
                start: clip.start,
                end: clip.end,
                reframe: clip.reframe !== false,
                subtitleStyle: clip.subtitleStyle || 'viral-bold',
                captions: clip.captions,
            }, (pct, msg) => {
                store.updateClip(project.id, clip.id, { exportProgress: pct });
                sendProgress(project.id, { clipExport: { clipId: clip.id, progress: pct, msg } });
            });

            store.updateClip(project.id, clip.id, {
                status: 'exported',
                exported: true,
                exportProgress: 100,
                clipPath: result.clipPath,
                thumbPath: result.thumbPath,
                fileSize: result.fileSize,
            });

            sendProgress(project.id, { clipExport: { clipId: clip.id, progress: 100, done: true } });
        } catch (err) {
            console.error('[export]', err);
            store.updateClip(project.id, clip.id, { status: 'export_error' });
        }
    })();
});

// ── GET /api/videos/:pid/clips/:cid/download ─────────────────
router.get('/:pid/clips/:cid/download', (req, res) => {
    const project = store.getProject(req.params.pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const clip = project.clips.find(c => c.id === req.params.cid);
    if (!clip?.clipPath) return res.status(404).json({ error: 'Clip not exported yet' });
    if (!fs.existsSync(clip.clipPath)) return res.status(404).json({ error: 'File not found' });

    const safeName = `clipforge_${clip.title?.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.mp4`;
    res.download(clip.clipPath, safeName);
});

// ── GET /api/videos/:pid/clips/:cid/thumbnail ────────────────
router.get('/:pid/clips/:cid/thumbnail', (req, res) => {
    const project = store.getProject(req.params.pid);
    const clip = project?.clips.find(c => c.id === req.params.cid);
    if (!clip?.thumbPath || !fs.existsSync(clip.thumbPath)) {
        return res.status(404).json({ error: 'Thumbnail not available' });
    }
    res.sendFile(path.resolve(clip.thumbPath));
});

module.exports = router;
