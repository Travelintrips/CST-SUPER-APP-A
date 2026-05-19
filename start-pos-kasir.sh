#!/usr/bin/env bash
set -e

# Kill stale processes on ports we'll use
for PORT in 8080 5000; do
  lsof -ti :${PORT} 2>/dev/null | xargs -r kill -9 2>/dev/null || true
done
sleep 1

echo "==> Building API Server..."
cd /home/runner/workspace/artifacts/api-server
node ./build.mjs

echo "==> Starting API Server on port 8080..."
PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
APISERVER_PID=$!

cd /home/runner/workspace

echo "==> Starting POS Kasir (Customer Portal) on port 5000..."
cd artifacts/customer-portal
PORT=5000 pnpm exec vite --config vite.pos.config.ts --host 0.0.0.0 &
PORTAL_PID=$!

echo "==> POS Kasir started. API=$APISERVER_PID Portal=$PORTAL_PID"
echo "==> Buka /kasir/login untuk masuk sebagai kasir"

wait
