# ClipForge AI — Backend Setup Guide

## 🏗️ Architecture
```
YouTube URL → yt-dlp (download) → FFmpeg (cut/reframe) → OpenAI Whisper (transcribe) → GPT-4 (hook detection) → Viral Clips
```

## ⚡ Quick Start (3 steps)

### Step 1 — Install System Dependencies

**FFmpeg** (video processing):
```powershell
# Windows — using winget
winget install ffmpeg

# OR download from: https://ffmpeg.org/download.html
# Extract and add to PATH
```

**yt-dlp** (YouTube downloader):
```powershell
# Windows — using pip
pip install yt-dlp

# OR download yt-dlp.exe from: https://github.com/yt-dlp/yt-dlp/releases
# Place in C:\Windows\System32\ or add to PATH
```

Verify installation:
```powershell
ffmpeg -version
yt-dlp --version
```

### Step 2 — Install Node.js Dependencies
```powershell
cd C:\Users\Dell\Downloads\stitch\backend
npm install
```

### Step 3 — Configure & Run
```powershell
# Copy env template
copy .env.example .env

# Edit .env — add your OpenAI key (optional, works without it in mock mode)
# OPENAI_API_KEY=sk-...

# Start the server
npm start
```

The server starts at **http://localhost:3001**

---

## 🔑 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/videos/info` | Validate URL + get video metadata |
| `POST` | `/api/videos/process` | **Start AI analysis pipeline** (async) |
| `GET`  | `/api/videos/progress/:id` | SSE stream for real-time progress |
| `GET`  | `/api/videos` | List all projects |
| `GET`  | `/api/videos/:id` | Get project + clips |
| `POST` | `/api/videos/:id/cut` | **Manual cut** — specify start/end times |
| `PATCH`| `/api/videos/:pid/clips/:cid` | Update clip settings |
| `DELETE`| `/api/videos/:pid/clips/:cid` | Delete a clip |
| `POST` | `/api/videos/:pid/clips/:cid/export` | Export clip (reframe + subtitles) |
| `GET`  | `/api/videos/:pid/clips/:cid/download` | Download exported MP4 |
| `GET`  | `/api/health` | Server health + service status |

---

## 🤖 AI Pipeline (what happens when you paste a URL)

```
1. Validate URL              → yt-dlp info fetch
2. Download Video            → yt-dlp, best mp4 ≤ 1080p
3. Extract Audio             → FFmpeg → mono MP3 16kHz
4. Transcribe                → OpenAI Whisper API (word-level timestamps)
5. Detect Viral Hooks        → GPT-4o (analyzes transcript, finds top 5 clips)
6. Generate Captions         → Word-by-word from Whisper timestamps
7. Generate Metadata         → GPT-4o-mini (titles, hashtags, captions)
8. Return to Frontend        → SSE progress stream → clips ready to edit
```

**Without OpenAI key** → mock mode: generates realistic clip suggestions instantly.

---

## ✂️ Manual Cutting API

```javascript
// POST /api/videos/:projectId/cut
{
  "start": 42.5,         // seconds from video start
  "end": 78.0,           // seconds from video end
  "title": "Best Moment",
  "subtitleStyle": "viral-bold"  // viral-bold | minimal | neon-glow | cinematic
}
```

---

## 📤 Export Pipeline

When you click Export, the server:
1. Cuts the exact clip with FFmpeg (lossless seek)
2. Reframes to **9:16** with smart center-crop + blurred background bars
3. Burns **ASS subtitles** directly into the video (word-by-word animated)
4. Generates a **thumbnail** at 1-second mark
5. Makes it available for download

---

## 💾 Storage

| Directory | Contents |
|-----------|----------|
| `backend/uploads/{projectId}/` | Downloaded source videos |
| `backend/clips/{projectId}/`   | Exported clips + thumbnails |

To use a database instead of in-memory store, replace `backend/store/projects.js` with a SQLite or PostgreSQL adapter.

---

## 🚀 Deploy to Production

```powershell
# Build frontend (no build step needed — pure HTML/CSS/JS)

# Deploy backend to a VPS or cloud
# Recommended: Railway, Render, or a $6/mo VPS

# Set environment variables:
# PORT=3001
# OPENAI_API_KEY=sk-...
# FRONTEND_URL=https://your-domain.com
```

---

## 💰 Cost Estimate (per video processed with OpenAI)

| Service | Cost |
|---------|------|
| Whisper transcription (1hr video) | ~$0.36 |
| GPT-4o hook detection | ~$0.05 |
| GPT-4o-mini metadata | ~$0.002 |
| **Total per video** | **~$0.41** |

At $29/mo Pro plan with 50 videos/month → cost is ~$20.50 → **profit margin: 29%** (before hosting).
Add your own markup and upsell on credits!
