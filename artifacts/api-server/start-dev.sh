#!/bin/bash
cd "$(dirname "$0")"

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs 18444 8080
sleep 0.5

# Build
node build.mjs

# exec replaces bash so Replit SIGTERM hits node directly → clean port release
exec env PORT=8080 REPLIT_API_GATEWAY_PORT=18444 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
