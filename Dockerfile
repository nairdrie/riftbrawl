# RIFTBRAWL — single-process game server (static client + ws + authoritative sim)
# No native deps anymore (accounts live in Supabase, not on disk).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY shared ./shared
COPY public ./public

USER node
EXPOSE 3000
ENV PORT=3000

# Supabase config is injected at runtime (never baked into the image):
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# e.g. `docker run -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... ...`

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
