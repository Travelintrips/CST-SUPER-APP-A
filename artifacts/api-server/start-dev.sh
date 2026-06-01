#!/bin/bash
cd "$(dirname "$0")"

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs 18444 8080
sleep 0.5

# Build
node build.mjs

# Start API server on 8080 (gateway default API_PORT).
# REPLIT_API_GATEWAY_PORT=18444 causes index.ts to also bind on 18444
# so Replit's workflow health-check (waitForPort=18444) passes.
PORT=8080 REPLIT_API_GATEWAY_PORT=18444 NODE_ENV=development node --enable-source-maps ./dist/index.mjs
