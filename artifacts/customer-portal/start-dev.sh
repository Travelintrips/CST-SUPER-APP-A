#!/bin/bash
# Capture the port injected by Replit's artifact system (e.g. 23434)
# before we override PORT to 5000 for Vite.
ARTIFACT_PORT=${PORT:-3000}
export PORT=5000
export BASE_PATH=${BASE_PATH:-/}

# Kill anything already on 5000
fuser -k 5000/tcp 2>/dev/null || true

# Open a dummy TCP listener on the artifact-injected port so the artifact
# system's health-check (waitForPort) is satisfied immediately.
if [ "$ARTIFACT_PORT" != "5000" ]; then
  node -e "require('net').createServer().listen(${ARTIFACT_PORT}, '0.0.0.0')" &
  sleep 0.4
fi

exec vite --config vite.config.ts --host 0.0.0.0
