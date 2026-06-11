#!/bin/bash
cd "$(dirname "$0")"

VITE_PORT=${VITE_PORT:-21174}
GW_PORT=${WA_GATEWAY_PORT:-8000}
FORWARDER_PORT=$GW_PORT
ACTUAL_PORT=21175

node "../api-server/kill-port.mjs" "${GW_PORT}" "${VITE_PORT}" "${ACTUAL_PORT}" 2>/dev/null || true
sleep 0.3

# Start port-forwarder IMMEDIATELY so Replit's waitForPort check passes
FORWARDER_PORT=$FORWARDER_PORT TARGET_PORT=$ACTUAL_PORT node -e "
const net = require('net');
const LISTEN = parseInt(process.env.FORWARDER_PORT);
const TARGET = parseInt(process.env.TARGET_PORT);
const server = net.createServer((src) => {
  const dst = net.connect(TARGET, '127.0.0.1');
  src.pipe(dst); dst.pipe(src);
  src.on('error', () => dst.destroy());
  dst.on('error', () => src.destroy());
});
server.listen(LISTEN, '0.0.0.0', () => {
  process.stdout.write('[wa-gateway-forwarder] ' + LISTEN + ' -> ' + TARGET + '\n');
});
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
" &
FORWARDER_PID=$!

# Start Vite dev server (internal, proxied by Express)
(cd client && node_modules/.bin/vite --port "$VITE_PORT" --host 0.0.0.0) &
VITE_PID=$!

trap "kill \$VITE_PID \$FORWARDER_PID 2>/dev/null; exit" TERM INT

# Keep backend running — auto-restart on crash
while true; do
  BASE_PATH=/wa-gateway PORT=$ACTUAL_PORT VITE_PORT=$VITE_PORT node_modules/.bin/tsx watch src/index.ts
  echo "[wa-gateway] backend exited (code $?), restarting in 2s..."
  sleep 2
done
