#!/bin/bash
set -e
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
" &
FORWARDER_PID=$!

# Start Vite dev server (internal, proxied by Express)
(cd client && node_modules/.bin/vite --port "$VITE_PORT" --host 0.0.0.0) &
VITE_PID=$!

# Start Express on ACTUAL_PORT — proxies non-API requests to Vite
BASE_PATH=/wa-gateway PORT=$ACTUAL_PORT VITE_PORT=$VITE_PORT node_modules/.bin/tsx watch src/index.ts &
BACKEND_PID=$!

trap "kill \$BACKEND_PID \$VITE_PID \$FORWARDER_PID 2>/dev/null; exit" TERM INT

wait $BACKEND_PID
kill $VITE_PID $FORWARDER_PID 2>/dev/null || true
