#!/bin/bash
export BASE_PATH=${BASE_PATH:-/bizportal/}

# Kill anything already on the target port
fuser -k ${PORT:-3000}/tcp 2>/dev/null || true

exec vite --config vite.config.ts --host 0.0.0.0
