#!/usr/bin/env bash

echo "==> POS Kasir mode"
echo "==> /kasir/login tersedia via customer-portal artifact"

# Check if API server is already running on 8080
if curl -sf http://localhost:8080/api/portal/company >/dev/null 2>&1; then
  echo "==> API Server sudah berjalan di port 8080, skip build."
else
  echo "==> Building & starting API Server on port 8080..."
  fuser -k 8080/tcp 2>/dev/null || true
  sleep 1

  cd /home/runner/workspace/artifacts/api-server
  node ./build.mjs

  PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs &
  echo "==> API Server started (PID=$!)"
fi

echo "==> Buka /kasir/login untuk masuk sebagai kasir"

# Start Sport Center frontend jika belum berjalan
if ! curl -sf http://localhost:3002/sport-center/ >/dev/null 2>&1; then
  echo "==> Starting Sport Center frontend on port 3002..."
  cd /home/runner/workspace/artifacts/sport-center
  PORT=3002 BASE_PATH=/sport-center/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 &
  echo "==> Sport Center started (PID=$!)"
fi

cd /home/runner/workspace

# Keep the workflow alive indefinitely
exec tail -f /dev/null
