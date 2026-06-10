#!/bin/bash
ARTIFACT_PORT=${PORT:-3000}
GATEWAY_PORT=4200

node "$(dirname "$0")/../api-server/kill-port.mjs" "${ARTIFACT_PORT}" 2>/dev/null || true
node "$(dirname "$0")/../api-server/kill-port.mjs" "${GATEWAY_PORT}" 2>/dev/null || true
sleep 0.3

export PORT=$ARTIFACT_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

# Start port-forwarder: Gateway hits 4200, Vite is on ARTIFACT_PORT
node -e "
const net = require('net');
const LISTEN = ${GATEWAY_PORT};
const TARGET = ${ARTIFACT_PORT};
const srv = net.createServer(src => {
  const dst = net.connect(TARGET, '127.0.0.1');
  src.pipe(dst); dst.pipe(src);
  src.on('error', () => dst.destroy());
  dst.on('error', () => src.destroy());
});
srv.listen(LISTEN, '0.0.0.0', () => process.stdout.write('[biz-fwd] ' + LISTEN + ' -> ' + TARGET + '\n'));
srv.on('error', e => process.stderr.write('[biz-fwd] ' + e.message + '\n'));
" &
FWD_PID=$!

trap "kill \$FWD_PID 2>/dev/null; exit" TERM INT

exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${ARTIFACT_PORT}"
