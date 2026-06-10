# ---- builder ----
# Full image (not -slim) so native modules (better-sqlite3, argon2) can compile
# from source if a prebuilt binary for this ABI is unavailable.
FROM node:22-bookworm AS builder
WORKDIR /app

# Install deps (cached on lockfile). Native modules (better-sqlite3, argon2)
# fetch prebuilds or compile here.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
# app workspace: web imports @capacitor/* (dynamically), so its deps must exist
COPY app/package.json ./app/package.json
# npm install (not ci): the committed lockfile can't be regenerated in the dev
# sandbox (TLS interception), so resolve fresh here in the clean build network.
RUN npm install --no-audit --no-fund

# Build web (vite) then server (tsc -> dist), then drop dev deps.
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/eazio.db

# Mirror the repo layout so server/dist resolves ../../web/dist and ../../drizzle.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/drizzle ./server/drizzle
COPY --from=builder /app/server/seeds ./server/seeds
COPY --from=builder /app/web/dist ./web/dist

RUN mkdir -p /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
