#!/bin/bash
# Starts all services + gateway for Replit development environment

# Kill stale processes on key ports
node artifacts/api-server/kill-port.mjs 5000 8080 18442 18444 19368 23434 2>/dev/null || true
sleep 0.5

# --- API Server (builds then runs on 8080, port-forwarded to 18444) ---
echo "[start] API Server..."
(cd artifacts/api-server && bash start-dev.sh) &

# --- BizPortal Vite dev server on 18442 ---
echo "[start] BizPortal..."
(cd artifacts/bizportal && PORT=18442 BASE_PATH=/bizportal/ bash start-dev.sh) &

# --- Customer Portal Vite dev server on 23434 ---
echo "[start] Customer Portal..."
(cd artifacts/customer-portal && PORT=23434 BASE_PATH=/ bash start-dev.sh) &

# --- Logistic Order Vite dev server on 19368 ---
echo "[start] Logistic Order..."
(cd artifacts/logistic-order && PORT=19368 BASE_PATH=/logistic-order/ pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port 19368) &

# --- Gateway on 5000 ---
echo "[start] Gateway on :5000..."
export API_PORT=18444
export BIZPORTAL_PORT=18442
export CUSTOMER_PORT=23434
export LOGISTIC_ORDER_PORT=19368
export PORT=5000

# Trap to clean up all child processes on exit
trap "kill 0 2>/dev/null; exit" TERM INT EXIT

exec node gateway.mjs
