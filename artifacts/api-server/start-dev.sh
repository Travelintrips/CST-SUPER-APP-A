#!/bin/bash
# Kill stale processes on both ports
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 18444/tcp 2>/dev/null || true
sleep 0.3

cd "$(dirname "$0")"

# Build
node build.mjs

# Start TCP forwarder 18444 -> 8080 so Replit can verify the external port
node port-forwarder.mjs &

# Start API server
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
