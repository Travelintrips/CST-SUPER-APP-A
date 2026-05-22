#!/bin/bash
ARTIFACT_PORT=${PORT:-3000}

# Kill any existing process on target port and on legacy 3000
fuser -k "${ARTIFACT_PORT}/tcp" 2>/dev/null || true
if [ "$ARTIFACT_PORT" != "3000" ]; then
  fuser -k 3000/tcp 2>/dev/null || true
fi
sleep 0.3

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

exec vite --config vite.config.ts --host 0.0.0.0
