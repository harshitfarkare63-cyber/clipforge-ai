# ── ClipForge AI — Production Dockerfile ─────────────────────
FROM node:20-slim

# Install Python (for yt-dlp) and system deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp || pip3 install yt-dlp

# Set working directory
WORKDIR /app

# Copy backend package files first (for better Docker layer caching)
COPY backend/package*.json ./backend/

# Install Node dependencies (includes ffmpeg-static)
RUN cd backend && npm ci --omit=dev

# Copy the entire project
COPY . .

# Create upload/clip directories
RUN mkdir -p backend/uploads backend/clips

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
ENV UPLOADS_DIR=/app/backend/uploads
ENV CLIPS_DIR=/app/backend/clips

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Start the server
CMD ["node", "backend/server.js"]
