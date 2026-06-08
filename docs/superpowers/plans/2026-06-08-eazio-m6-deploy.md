# Eazio M6 — Docker & Deploy Implementation Plan

> **For agentic workers:** Config/ops milestone (no unit tests). Verification = `docker build` succeeds and the container serves `/api/health` + the SPA. `- [ ]` checkboxes.

**Goal:** Package Eazio as a single Docker image (Fastify API + bundled SPA + SQLite), run it via docker-compose on the home server `192.168.178.33` attached to the existing Nginx Proxy Manager (NPM) network, and provide a one-command deploy script. NPM terminates TLS and proxies a domain to `http://eazio:3000`.

**Architecture:** Multi-stage Dockerfile. Stage 1 (builder, `node:22`) installs all workspace deps, builds `web` (→ `web/dist`) and `server` (→ `server/dist`), then prunes dev deps. Stage 2 (runtime, `node:22-slim`) receives the **mirrored repo layout** `/app/server/{dist,drizzle,package.json}` + `/app/web/dist` + `/app/node_modules` so the compiled server resolves `../../web/dist` and `../../drizzle` correctly. The server entry runs migrations then listens; the existsSync-guarded static block serves the SPA.

**Why node:22 (not 25):** native modules `better-sqlite3` + `argon2` have prebuilt binaries for Node 22 LTS on linux; the runtime base must match the builder base so the compiled/downloaded native `.node` files are ABI-compatible.

## Key path facts (already true in the code)
- `webDir = resolve(dirname(server/dist/app.js), '../../web/dist')` → `/app/web/dist`.
- `MIGRATIONS_DIR = resolve(dirname(server/dist/db/client.js), '../../drizzle')` → `/app/server/drizzle`.
- `server/dist/index.js` (entry) does `ensureDbDir → createDb → runMigrations → buildApp → listen`. So container start = migrate + serve. `DATABASE_PATH=/data/eazio.db` (volume).
- The server build tsconfig now excludes `*.test.ts`, so `server/dist` ships no test code.
- ESM: `/app/server/package.json` (`"type":"module"`) must be copied so `server/dist/*.js` are treated as ESM.

---

### Task 1: `.dockerignore`
**File:** `.dockerignore`
```
node_modules
**/node_modules
**/dist
data
.git
.env
.env.*
!.env.example
*.log
coverage
docs
**/*.test.ts
**/*.test.tsx
```

---

### Task 2: `Dockerfile` (multi-stage)
**File:** `Dockerfile`
```dockerfile
# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install deps (cached on lockfile). Native modules (better-sqlite3, argon2)
# fetch prebuilds or compile here.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# Build web (vite) then server (tsc → dist), then drop dev deps.
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
COPY --from=builder /app/web/dist ./web/dist

RUN mkdir -p /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
```
- [ ] Build locally if Docker is available: `docker build -t eazio:local .`
- [ ] Smoke-run: `docker run --rm -e MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") -e SESSION_SECRET=devsecret-0123456789 -e ADMIN_BOOTSTRAP=devbootstrap -e COOKIE_SECURE=false -p 3000:3000 eazio:local` then `curl localhost:3000/api/health` → `{"status":"ok"}` and `curl localhost:3000/` → HTML containing `id="root"`.
- [ ] If Docker is NOT available locally, verify by inspection + rely on the server build during deploy.

---

### Task 3: `docker-compose.yml`
**File:** `docker-compose.yml`
```yaml
services:
  eazio:
    build: .
    image: eazio:latest
    container_name: eazio
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_PATH: /data/eazio.db
      COOKIE_SECURE: "true"
    volumes:
      - eazio-data:/data
    networks:
      - proxy
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

networks:
  proxy:
    external: true
    name: ${NPM_NETWORK:-npm_default}

volumes:
  eazio-data:
```
> `NPM_NETWORK` must be the docker network Nginx Proxy Manager runs on (find it with `docker network ls`). Same network → NPM reaches the app at `http://eazio:3000`. No host port is published.

---

### Task 4: update `.env.example`
Append a note that `COOKIE_SECURE=true` is correct behind NPM (HTTPS) and add `NPM_NETWORK` for compose. Keep existing keys. Final `.env.example`:
```dotenv
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/eazio.db
# 32-byte base64: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
MASTER_KEY=
# random, min 16 chars: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
SESSION_SECRET=
# token used once to create users via POST /api/auth/bootstrap
ADMIN_BOOTSTRAP=
TZ=Europe/Berlin
COOKIE_SECURE=true
YAZIO_COUNTRIES=DE
YAZIO_LOCALES=de_DE,de_US
# docker network that Nginx Proxy Manager runs on (docker network ls)
NPM_NETWORK=npm_default
```

---

### Task 5: `scripts/deploy.sh`
**File:** `scripts/deploy.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

# Deploys Eazio to the home server via SSH (root + key) and rebuilds the stack.
HOST="${EAZIO_HOST:-root@192.168.178.33}"
DIR="${EAZIO_DIR:-/opt/eazio}"

echo "→ Syncing source to ${HOST}:${DIR}"
ssh "$HOST" "mkdir -p ${DIR}"
rsync -az --delete \
  --exclude node_modules --exclude '**/node_modules' \
  --exclude dist --exclude '**/dist' \
  --exclude .git --exclude data --exclude .env \
  ./ "${HOST}:${DIR}/"

echo "→ Building & starting the stack"
ssh "$HOST" "cd ${DIR} && docker compose up -d --build && docker compose ps"

echo "→ Health check"
ssh "$HOST" "cd ${DIR} && sleep 6 && docker compose exec -T eazio node -e \"fetch('http://localhost:3000/api/health').then(r=>r.json()).then(j=>console.log('health:',JSON.stringify(j))).catch(e=>{console.error(e);process.exit(1)})\""

echo "✓ Deployed."
```
- [ ] `chmod +x scripts/deploy.sh` (or note Windows runs it via Git Bash / WSL).

> **`.env` is NOT synced** (excluded) — create it once on the server at `${DIR}/.env` with real secrets. The deploy never overwrites server secrets.

---

## One-time server setup (run on 192.168.178.33)
1. Install Docker + compose plugin (if absent).
2. Find the NPM network: `docker network ls` → set `NPM_NETWORK` in `/opt/eazio/.env`.
3. Create `/opt/eazio/.env` from `.env.example` with generated `MASTER_KEY`, `SESSION_SECRET`, a chosen `ADMIN_BOOTSTRAP`, and `NPM_NETWORK`.
4. From the dev machine: `EAZIO_HOST=root@192.168.178.33 scripts/deploy.sh`.
5. In Nginx Proxy Manager UI → **Proxy Hosts → Add**: your domain → Forward Hostname `eazio`, Port `3000`, scheme `http`; enable SSL (Let's Encrypt). (NPM and the eazio container must share `NPM_NETWORK`.)
6. Create the first user (once):
   `curl -X POST https://<domain>/api/auth/bootstrap -H 'content-type: application/json' -d '{"token":"<ADMIN_BOOTSTRAP>","username":"jens","password":"<your-pw>"}'`
7. Log in at `https://<domain>/`, link a Yazio account under **Konten**, then track.

## Self-Review (M6)
- Multi-stage image builds web+server, runtime has the mirrored layout + pruned prod deps + native modules (node:22 ABI) → Tasks 1-2. ✅
- Compose: shared external NPM network, `/data` volume, env_file, healthcheck, no host port → Task 3. ✅
- `.env.example` documents secrets + NPM_NETWORK; `.env` never committed/synced → Tasks 4-5. ✅
- Deploy script rsyncs (excluding secrets/build) + `docker compose up -d --build` + health check → Task 5. ✅
- Server start runs migrations; SQLite persisted on a named volume; SPA served; API JSON 404 preserved. ✅
