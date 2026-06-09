#!/bin/bash
cd "$(dirname "$0")"

API_PORT=${API_PORT:-8080}
FORWARDER_PORT=${FORWARDER_PORT:-18444}

# Kill stale processes on both ports
node kill-port.mjs "$FORWARDER_PORT" "$API_PORT"
sleep 0.5

# Start port-forwarder IMMEDIATELY so Replit's waitForPort check passes
# The forwarder will buffer/retry connections until API is ready
FORWARDER_PORT=$FORWARDER_PORT node port-forwarder.mjs &
FORWARDER_PID=$!

# Start watch-mode dev server (esbuild watch + auto-restart on rebuild)
PORT=$API_PORT node dev.mjs &
DEV_PID=$!

# Trap signals to clean up child processes
trap "kill $DEV_PID $FORWARDER_PID 2>/dev/null; exit" TERM INT

# Wait for dev watcher (the main process)
wait $DEV_PID
