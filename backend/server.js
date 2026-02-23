/**
 * ClipForge AI — Express Server
 * Run: node server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
const rateLimit = require('express-rate-limit');

// ── FFmpeg auto-configuration (uses bundled ffmpeg-static) ───
const { configureFfmpeg, isAvailable: isFfmpegAvailable } = require('./utils/ffmpeg-resolver');
configureFfmpeg();


const app = express();
const PORT = process.env.PORT || 3001;

// ── Ensure directories exist ─────────────────────────────────
const DIRS = [
    process.env.UPLOADS_DIR || './uploads',
    process.env.CLIPS_DIR || './clips',
];
DIRS.forEach(d => fs.ensureDirSync(d));

// ── Security & logging middleware ─────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan('dev'));
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? true  // allow all origins in production (frontend is served from same domain)
        : [
            process.env.FRONTEND_URL || 'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:5173',
            'file://',
        ],
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', apiLimiter);

// Stricter limit for processing (heavy operations)
const processLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: 'Processing limit reached. Try again in an hour.' },
});
app.use('/api/videos/process', processLimiter);

// ── Static file serving ───────────────────────────────────────
// Serve frontend from parent directory
app.use(express.static(path.join(__dirname, '..')));
// Serve clips for streaming/download
app.use('/clips', express.static(path.resolve(process.env.CLIPS_DIR || './clips')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/videos', require('./routes/videos'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services: {
            gemini: !!process.env.GEMINI_API_KEY,
            ffmpeg: checkFfmpeg(),
            ytdlp: checkYtdlp(),
        }
    });
});

// ── Fallback: serve index.html for all other routes ───────────
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🎬 ClipForge AI Backend running at http://localhost:${PORT}`);
    console.log(`📁 Uploads: ${path.resolve(process.env.UPLOADS_DIR || './uploads')}`);
    console.log(`📁 Clips:   ${path.resolve(process.env.CLIPS_DIR || './clips')}`);
    console.log(`🤖 Gemini:  ${process.env.GEMINI_API_KEY ? '✅ Configured' : '⚠️  Not set (mock mode)'}`);
    console.log(`🔧 FFmpeg:  ${checkFfmpeg() ? '✅ Found' : '❌ Not found — install FFmpeg!'}`);
    console.log(`📥 yt-dlp: ${checkYtdlp() ? '✅ Found' : '❌ Not found — install yt-dlp!'}`);
    console.log('\nOpen http://localhost:3001 to use ClipForge AI\n');
});

function checkFfmpeg() { return isFfmpegAvailable(); }
function checkYtdlp() {
    try { require('child_process').execSync('yt-dlp --version', { stdio: 'pipe' }); return true; } catch { return false; }
}


module.exports = app;
