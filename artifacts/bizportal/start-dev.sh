#!/bin/bash
ARTIFACT_PORT=${PORT:-18442}

# Kill any existing process on target port and wait for it to die
fuser -k "${ARTIFACT_PORT}/tcp" 2>/dev/null || true
for i in 1 2 3 4 5; do
  sleep 0.5
  lsof -ti:"${ARTIFACT_PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  if ! lsof -i:"${ARTIFACT_PORT}" >/dev/null 2>&1; then
    break
  fi
done

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${ARTIFACT_PORT}"
