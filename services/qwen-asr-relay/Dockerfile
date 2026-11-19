# Private persistent WebSocket relay; does not include provider keys.
# Host it behind a TLS reverse proxy. Do not deploy with billing until approved.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
ENV HOST=0.0.0.0 PORT=8789 ASR_ENABLED=false MOCK_ASR=false
EXPOSE 8789
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('node:http').get('http://127.0.0.1:8789/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","server.mjs"]
