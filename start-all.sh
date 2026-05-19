#!/usr/bin/env bash
set -e

# Kill any stale processes on our ports before starting
# Note: customer portal (23434) is managed by its own workflow — do NOT kill it here
for PORT in 8080 5000 8082; do
  fuser -k ${PORT}/tcp 2>/dev/null || true
done

echo "==> Building API Server..."
cd /home/runner/workspace/artifacts/api-server
node ./build.mjs

echo "==> Starting API Server on port 8080..."
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
APISERVER_PID=$!

cd /home/runner/workspace

echo "==> Starting BizPortal frontend on port 5000..."
cd artifacts/bizportal
PORT=5000 BASE_PATH=/bizportal/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
BIZPORTAL_PID=$!

echo "==> Starting Sport Center on port 8082..."
cd ../sport-center
PORT=8082 BASE_PATH=/sport-center/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
SPORT_PID=$!

echo "==> All services started. API=$APISERVER_PID BizPortal=$BIZPORTAL_PID Sport=$SPORT_PID"
wait
