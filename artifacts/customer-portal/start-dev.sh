#!/bin/bash
VITE_PORT=5174

node "$(dirname "$0")/../api-server/kill-port.mjs" "$VITE_PORT" 2>/dev/null || true
sleep 0.3

export PORT=$VITE_PORT
export BASE_PATH=${BASE_PATH:-/}

exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port $VITE_PORT
