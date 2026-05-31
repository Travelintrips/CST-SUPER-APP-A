#!/bin/bash
cd "$(dirname "$0")"

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs 18444 8080
sleep 0.5

# Build
node build.mjs

# Start API server on 8080 (gateway default API_PORT).
# index.ts will also bind on 18444 (GATEWAY_PORT secondary binding).
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
