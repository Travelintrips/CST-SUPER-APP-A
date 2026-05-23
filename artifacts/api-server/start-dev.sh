#!/bin/bash
# Kill stale process on port 8080 before starting
fuser -k 8080/tcp 2>/dev/null || true
sleep 0.5

# Build then start
cd "$(dirname "$0")"
node build.mjs && PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
