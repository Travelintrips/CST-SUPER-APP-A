#!/bin/bash
cd "$(dirname "$0")"

API_PORT=${API_PORT:-8080}
FORWARDER_PORT=${FORWARDER_PORT:-18444}

# Kill stale processes on both ports
node kill-port.mjs "$FORWARDER_PORT" "$API_PORT"
sleep 0.5

# Start the esbuild watcher — it handles building and running the server
PORT=$API_PORT node dev.mjs &
DEV_PID=$!

# Wait for API_PORT to be open before starting port-forwarder
node -e "
const net = require('net');
const port = $API_PORT;
function waitForPort(cb, retries) {
  retries = retries || 0;
  if (retries > 300) { cb(); return; }
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); cb(); });
  s.on('error', () => setTimeout(() => waitForPort(cb, retries + 1), 200));
}
waitForPort(() => process.exit(0));
"
FORWARDER_PORT=$FORWARDER_PORT node port-forwarder.mjs &
FORWARDER_PID=$!

# Trap signals to clean up child processes
trap "kill $DEV_PID $FORWARDER_PID 2>/dev/null; exit" TERM INT

# Wait for dev watcher (the main process)
wait $DEV_PID
