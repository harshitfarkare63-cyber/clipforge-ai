/**
 * ClipForge AI — YouTube Service
 * Downloads videos using yt-dlp CLI directly (no wrapper library issues)
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

// ── Find yt-dlp binary ────────────────────────────────────────
function getYtdlpBin() {
    try { execSync('yt-dlp --version', { stdio: 'pipe' }); return 'yt-dlp'; } catch { }
    // Try Python module
    try { execSync('python -m yt_dlp --version', { stdio: 'pipe' }); return 'python -m yt_dlp'; } catch { }
    throw new Error('yt-dlp not found. Install with: pip install yt-dlp');
}

// ── Validate YouTube / Twitch URL ─────────────────────────────
function isValidYouTubeUrl(url) {
    const patterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
        /^https?:\/\/youtu\.be\/[\w-]{11}/,
        /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]{11}/,
        /^https?:\/\/(www\.)?twitch\.tv\/.+/,
    ];
    return patterns.some(p => p.test(url));
}

// ── Get video metadata (no download) ─────────────────────────
function getVideoInfo(url) {
    const bin = getYtdlpBin();
    const cmd = `${bin} --dump-json --no-playlist "${url}"`;

    return new Promise((resolve, reject) => {
        try {
            const raw = execSync(cmd, { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
            const info = JSON.parse(raw.toString());
            resolve({
                id: info.id,
                title: info.title,
                duration: info.duration,
                durationStr: formatDuration(info.duration),
                thumbnail: info.thumbnail,
                uploader: info.uploader,
                viewCount: info.view_count,
                uploadDate: info.upload_date,
                description: (info.description || '').slice(0, 500),
                chapters: info.chapters || [],
            });
        } catch (err) {
            // yt-dlp may output valid JSON to stdout even on exit code 1
            // (update notices go to stderr)
            const stdout = err.stdout?.toString() || '';
            if (stdout.trim().startsWith('{')) {
                try {
                    const info = JSON.parse(stdout);
                    resolve({
                        id: info.id,
                        title: info.title,
                        duration: info.duration,
                        durationStr: formatDuration(info.duration),
                        thumbnail: info.thumbnail,
                        uploader: info.uploader,
                        viewCount: info.view_count,
                        uploadDate: info.upload_date,
                        description: (info.description || '').slice(0, 500),
                        chapters: info.chapters || [],
                    });
                    return;
                } catch { }
            }
            reject(new Error(`yt-dlp error: ${err.stderr?.toString()?.slice(0, 200) || err.message}`));
        }
    });
}

// ── Download video ────────────────────────────────────────────
function downloadVideo(url, projectId, onProgress) {
    const bin = getYtdlpBin();
    const outDir = path.join(UPLOADS_DIR, projectId);
    fs.ensureDirSync(outDir);

    // Use a fixed output name so we always know where the file is
    const outputPath = path.join(outDir, 'source.mp4');
    const args = [
        url,
        // Best single-file mp4 (avoids needing to merge)
        '-f', 'best[ext=mp4][height<=1080]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--no-playlist',
        '--newline',
        '--no-warnings',
        // Remove any partial files from previous failed attempts
        '--no-part',
    ];

    const binParts = bin.split(' ');
    const proc = spawn(binParts[0], [...binParts.slice(1), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });

    return new Promise((resolve, reject) => {
        proc.stdout.on('data', (chunk) => {
            const line = chunk.toString();
            const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
            if (match && onProgress) onProgress(parseFloat(match[1]));
        });

        proc.stderr.on('data', (d) => {
            const msg = d.toString();
            if (!msg.includes('update') && !msg.includes('WARNING') && !msg.includes('Deleting')) {
                console.error('[yt-dlp]', msg.slice(0, 200));
            }
        });

        proc.on('close', (code) => {
            // Find any video file (yt-dlp may add extension suffix)
            const files = fs.readdirSync(outDir)
                .filter(f => /\.(mp4|mkv|webm)$/.test(f) && !f.endsWith('.temp.mp4'))
                .map(f => ({ name: f, size: fs.statSync(path.join(outDir, f)).size }))
                .sort((a, b) => b.size - a.size); // largest first = most likely the merged final

            if (files.length > 0) {
                const finalPath = path.join(outDir, files[0].name);
                if (onProgress) onProgress(100);
                console.log(`[YouTube] Downloaded: ${files[0].name} (${Math.round(files[0].size / 1024 / 1024)}MB)`);
                resolve(finalPath);
            } else {
                reject(new Error(`Download failed (exit ${code}). Check URL and try again.`));
            }
        });

        proc.on('error', (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)));
    });
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = { isValidYouTubeUrl, getVideoInfo, downloadVideo };
