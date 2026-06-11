#!/bin/bash
set -e
cd "$(dirname "$0")"

VITE_PORT=${VITE_PORT:-21174}
GW_PORT=${WA_GATEWAY_PORT:-8000}

node "../api-server/kill-port.mjs" "${GW_PORT}" "${VITE_PORT}" 2>/dev/null || true
sleep 0.5

# Start Vite dev server (internal, proxied by Express)
(cd client && pnpm exec vite --port "$VITE_PORT" --host 0.0.0.0) &
VITE_PID=$!

# Start Express directly on GW_PORT — proxies non-API requests to Vite
BASE_PATH=/wa-gateway PORT=$GW_PORT VITE_PORT=$VITE_PORT pnpm exec tsx watch src/index.ts &
BACKEND_PID=$!

trap "kill \$BACKEND_PID \$VITE_PID 2>/dev/null; exit" TERM INT

wait $BACKEND_PID
kill $VITE_PID 2>/dev/null || true
