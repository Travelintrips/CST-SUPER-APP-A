#!/bin/bash

# Kill any stale processes on our ports
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 0.5

# Build API Server if dist doesn't exist
if [ ! -f "artifacts/api-server/dist/index.mjs" ]; then
  echo "==> Building API Server..."
  (cd artifacts/api-server && node ./build.mjs)
fi

# Start API Server on port 8080
echo "==> Starting API Server on port 8080..."
(cd artifacts/api-server && PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs) &
API_PID=$!

# Start Customer Portal (Vite) on port 3001
echo "==> Starting Customer Portal on port 3001..."
(cd artifacts/customer-portal && PORT=3001 BASE_PATH=/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port 3001) &
CP_PID=$!

# Start BizPortal (Vite) on port 3000
echo "==> Starting BizPortal on port 3000..."
(cd artifacts/bizportal && PORT=3000 BASE_PATH=/bizportal/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port 3000) &
BP_PID=$!

# Start Gateway on port 5000 (routes all traffic)
echo "==> Starting Gateway on port 5000..."
fuser -k 5000/tcp 2>/dev/null || true
sleep 0.3
BIZPORTAL_PORT=3000 CUSTOMER_PORT=3001 API_PORT=8080 PORT=5000 node gateway.mjs

# If gateway exits, kill everything
kill $API_PID $CP_PID $BP_PID 2>/dev/null
