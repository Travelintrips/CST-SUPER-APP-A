#!/bin/bash
cd "$(dirname "$0")"

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs 18444 8080
sleep 0.5

# Build
node build.mjs

# Start main server in background
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
SERVER_PID=$!

# Wait for port 8080 to be open, then start port-forwarder on 18444
node -e "
const net = require('net');
function waitForPort(port, cb, retries) {
  retries = retries || 0;
  if (retries > 50) { cb(); return; }
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); cb(); });
  s.on('error', () => setTimeout(() => waitForPort(port, cb, retries + 1), 100));
}
waitForPort(8080, () => process.exit(0));
"
node port-forwarder.mjs &
FORWARDER_PID=$!

# Trap signals to clean up child processes
trap "kill $SERVER_PID $FORWARDER_PID 2>/dev/null; exit" TERM INT

# Wait for server (the main process)
wait $SERVER_PID
