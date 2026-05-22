#!/bin/bash
ARTIFACT_PORT=${PORT:-3001}

# Kill any existing process on target port and on legacy 3001
fuser -k "${ARTIFACT_PORT}/tcp" 2>/dev/null || true
if [ "$ARTIFACT_PORT" != "3001" ]; then
  fuser -k 3001/tcp 2>/dev/null || true
fi
sleep 0.3

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/}

exec vite --config vite.config.ts --host 0.0.0.0
