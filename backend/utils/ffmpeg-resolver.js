/**
 * ClipForge AI — FFmpeg Path Resolver
 * Uses ffmpeg-static (bundled binary) as primary, falls back to system PATH
 */

const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');

let _configured = false;

function configureFfmpeg() {
    if (_configured) return;
    _configured = true;

    // 1) Try ffmpeg-static (bundled with npm — always works)
    try {
        const ffmpegStatic = require('ffmpeg-static');
        const ffprobeStatic = require('@ffprobe-installer/ffprobe');
        if (ffmpegStatic) {
            ffmpeg.setFfmpegPath(ffmpegStatic);
            console.log(`[FFmpeg] Using bundled: ${ffmpegStatic}`);
        }
        if (ffprobeStatic?.path) {
            ffmpeg.setFfprobePath(ffprobeStatic.path);
        }
        return;
    } catch { }

    // 2) Try env var
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
        const probe = process.env.FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe');
        if (fs.existsSync(probe)) ffmpeg.setFfprobePath(probe);
        console.log(`[FFmpeg] Using env path: ${process.env.FFMPEG_PATH}`);
        return;
    }

    // 3) Try common Windows install locations
    const candidates = [
        `${process.env.USERPROFILE}\\ffmpeg\\ffmpeg.exe`,
        `${process.env.USERPROFILE}\\ffmpeg\\bin\\ffmpeg.exe`,
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\ffmpeg\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            ffmpeg.setFfmpegPath(p);
            const probe = p.replace('ffmpeg.exe', 'ffprobe.exe');
            if (fs.existsSync(probe)) ffmpeg.setFfprobePath(probe);
            console.log(`[FFmpeg] Using local path: ${p}`);
            return;
        }
    }

    // 4) Fall back to system PATH (works if ffmpeg is globally installed)
    console.log('[FFmpeg] Using system PATH');
}

function isAvailable() {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return true;
    } catch { }
    try {
        require('child_process').execSync('ffmpeg -version', { stdio: 'pipe' });
        return true;
    } catch { }
    const candidates = [
        `${process.env.USERPROFILE}\\ffmpeg\\ffmpeg.exe`,
        `${process.env.USERPROFILE}\\ffmpeg\\bin\\ffmpeg.exe`,
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
    ];
    return candidates.some(p => fs.existsSync(p));
}

module.exports = { configureFfmpeg, isAvailable };
