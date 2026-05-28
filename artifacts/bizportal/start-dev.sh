#!/bin/bash
ARTIFACT_PORT=${PORT:-18442}

# Kill any existing process on target port
fuser -k "${ARTIFACT_PORT}/tcp" 2>/dev/null || true
sleep 0.3

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

exec vite --config vite.config.ts --host 0.0.0.0
