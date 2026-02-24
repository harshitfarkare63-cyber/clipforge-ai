# ── ClipForge AI — Railway/Render Config ──────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages yt-dlp 2>/dev/null || pip3 install yt-dlp

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY . .
RUN mkdir -p backend/uploads backend/clips

ENV NODE_ENV=production
ENV PORT=8080
ENV UPLOADS_DIR=/app/backend/uploads
ENV CLIPS_DIR=/app/backend/clips
EXPOSE 8080

CMD ["node", "backend/server.js"]
