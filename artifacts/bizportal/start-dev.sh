#!/bin/bash
ARTIFACT_PORT=${PORT:-3000}

node "$(dirname "$0")/../api-server/kill-port.mjs" "${ARTIFACT_PORT}" 2>/dev/null || true
sleep 0.3

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${ARTIFACT_PORT}"
