#!/bin/bash
export BASE_PATH=${BASE_PATH:-/bizportal/}
TARGET_PORT=${PORT:-3000}

if curl -sf "http://localhost:${TARGET_PORT}/" -o /dev/null 2>/dev/null; then
  echo "[bizportal] port ${TARGET_PORT} already serving — yielding to main workflow"
  exec tail -f /dev/null
fi

fuser -k "${TARGET_PORT}"/tcp 2>/dev/null || true
exec vite --config vite.config.ts --host 0.0.0.0
