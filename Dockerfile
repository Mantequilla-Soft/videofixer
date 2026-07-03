# videofixer — Autonomous Video Repair API
FROM node:18-alpine

RUN apk add --no-cache ffmpeg curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

RUN mkdir -p /app/work && chmod 777 /app/work

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

ENV NODE_ENV=production
ENV WORK_DIR=/app/work

CMD ["npm", "start"]

LABEL org.opencontainers.image.title="videofixer"
LABEL org.opencontainers.image.description="Autonomous video repair API for the 3Speak encoding pipeline"
LABEL org.opencontainers.image.licenses="MIT"
