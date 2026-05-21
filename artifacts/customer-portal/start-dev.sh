#!/bin/bash
# Use the artifact-injected port (or 3003 as fallback so we never
# clash with the main BizPortal webview on port 5000).
ARTIFACT_PORT=${PORT:-3003}
export PORT=3003
export BASE_PATH=${BASE_PATH:-/}

# Kill anything already on 3003
fuser -k 3003/tcp 2>/dev/null || true

# Open a dummy TCP listener on the artifact-injected port so the artifact
# system's health-check (waitForPort) is satisfied immediately.
if [ "$ARTIFACT_PORT" != "3003" ]; then
  node -e "require('net').createServer().listen(${ARTIFACT_PORT}, '0.0.0.0')" &
  sleep 0.4
fi

exec vite --config vite.config.ts --host 0.0.0.0
