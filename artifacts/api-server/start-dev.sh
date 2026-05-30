#!/bin/bash
cd "$(dirname "$0")"

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs 18444 8080
sleep 0.5

# Build
node build.mjs

# Start API server directly on 18444
PORT=18444 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
