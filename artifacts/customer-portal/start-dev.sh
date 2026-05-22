#!/bin/bash
ARTIFACT_PORT=${PORT:-3001}

export PORT=3001
export BASE_PATH=${BASE_PATH:-/}

if curl -sf "http://localhost:3001/" -o /dev/null 2>/dev/null; then
  echo "[customer-portal] port 3001 already serving — yielding to main workflow"
  if [ "$ARTIFACT_PORT" != "3001" ] && [ "$ARTIFACT_PORT" != "5000" ]; then
    node -e "require('net').createServer().listen(${ARTIFACT_PORT}, '0.0.0.0')" &
  fi
  exec tail -f /dev/null
fi

fuser -k 3001/tcp 2>/dev/null || true

if [ "$ARTIFACT_PORT" != "3001" ] && [ "$ARTIFACT_PORT" != "5000" ]; then
  node -e "require('net').createServer().listen(${ARTIFACT_PORT}, '0.0.0.0')" &
  sleep 0.4
fi

exec vite --config vite.config.ts --host 0.0.0.0
