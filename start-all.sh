#!/usr/bin/env bash
set -e

# Kill any stale process on API port before starting
fuser -k 18444/tcp 2>/dev/null || true

echo "==> Building API Server..."
cd /home/runner/workspace/artifacts/api-server
node ./build.mjs

echo "==> Starting API Server on port 18444..."
PORT=18444 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
