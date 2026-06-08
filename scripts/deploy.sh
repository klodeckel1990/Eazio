#!/usr/bin/env bash
set -euo pipefail

# Deploys Eazio to the home server via SSH (root + key) and rebuilds the stack.
# Usage:  EAZIO_HOST=root@192.168.178.33 scripts/deploy.sh
# Prereqs on the server: Docker + compose plugin, and ${DIR}/.env with real secrets
#   (the .env is NEVER synced from the dev machine).

HOST="${EAZIO_HOST:-root@192.168.178.33}"
DIR="${EAZIO_DIR:-/opt/eazio}"

echo "→ Ensuring ${HOST}:${DIR} exists"
ssh "$HOST" "mkdir -p ${DIR}"

echo "→ Syncing source to ${HOST}:${DIR} (excluding node_modules, dist, data, .env, .git)"
rsync -az --delete \
  --exclude node_modules --exclude 'server/node_modules' --exclude 'web/node_modules' \
  --exclude dist --exclude 'server/dist' --exclude 'web/dist' \
  --exclude .git --exclude data --exclude .env \
  ./ "${HOST}:${DIR}/"

echo "→ Building & starting the stack"
ssh "$HOST" "cd ${DIR} && docker compose up -d --build && docker compose ps"

echo "→ Health check (inside the container)"
ssh "$HOST" "cd ${DIR} && sleep 6 && docker compose exec -T eazio node -e \"fetch('http://localhost:3000/api/health').then(r=>r.json()).then(j=>console.log('health:',JSON.stringify(j))).catch(e=>{console.error(e);process.exit(1)})\""

echo "✓ Deployed. Configure the NPM proxy host (forward to http://eazio:3000) if not done yet."
