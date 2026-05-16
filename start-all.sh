#!/usr/bin/env bash
set -e

# Kill any processes on our ports before starting
for PORT in 5000 8080; do
  fuser -k ${PORT}/tcp 2>/dev/null || true
done

echo "==> Building API server..."
cd artifacts/api-server
pnpm run build
echo "==> API server built."

echo "==> Starting API server on port 8080..."
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
API_PID=$!

echo "==> Starting BizPortal frontend on port 5000..."
cd ../bizportal
PORT=5000 BASE_PATH=/bizportal/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
BIZPORTAL_PID=$!

echo "==> Starting Customer Portal on port 23434..."
cd ../customer-portal
PORT=23434 BASE_PATH=/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
PORTAL_PID=$!

echo "==> All services started. API=$API_PID BizPortal=$BIZPORTAL_PID Portal=$PORTAL_PID"
wait
