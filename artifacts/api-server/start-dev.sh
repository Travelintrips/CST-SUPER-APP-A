#!/bin/bash
cd "$(dirname "$0")"

API_PORT=${API_PORT:-8080}
FORWARDER_PORT=${FORWARDER_PORT:-18444}

# Kill stale processes on both ports (uses /proc/net, works without fuser/ss/lsof)
node kill-port.mjs "$FORWARDER_PORT" "$API_PORT"
sleep 0.5

# Build
node build.mjs

# Start main server in background
PORT=$API_PORT NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
SERVER_PID=$!

# Wait for API_PORT to be open, then start port-forwarder on FORWARDER_PORT
node -e "
const net = require('net');
const port = $API_PORT;
function waitForPort(cb, retries) {
  retries = retries || 0;
  if (retries > 50) { cb(); return; }
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); cb(); });
  s.on('error', () => setTimeout(() => waitForPort(cb, retries + 1), 100));
}
waitForPort(() => process.exit(0));
"
FORWARDER_PORT=$FORWARDER_PORT node port-forwarder.mjs &
FORWARDER_PID=$!

# Trap signals to clean up child processes
trap "kill $SERVER_PID $FORWARDER_PID 2>/dev/null; exit" TERM INT

# Wait for server (the main process)
wait $SERVER_PID
