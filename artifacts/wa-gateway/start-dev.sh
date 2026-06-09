#!/bin/bash
set -e
cd "$(dirname "$0")"

BACKEND_PORT=${BACKEND_PORT:-21173}
VITE_PORT=${VITE_PORT:-21174}
GW_PORT=${WA_GATEWAY_PORT:-8000}

node "../api-server/kill-port.mjs" "${GW_PORT}" "${BACKEND_PORT}" "${VITE_PORT}" 2>/dev/null || true
sleep 0.5

# Start Express backend
BASE_PATH=/wa-gateway PORT=$BACKEND_PORT pnpm exec tsx watch src/index.ts &
BACKEND_PID=$!

# Start Vite dev server
(cd client && BACKEND_PORT=$BACKEND_PORT pnpm exec vite --port "$VITE_PORT" --host 0.0.0.0) &
VITE_PID=$!

# Start combined proxy on GW_PORT
# Routes /wa-gateway/api/* → Express backend
# Routes /* → Vite dev server
node -e "
const http = require('http');
const net  = require('net');
const GW   = $GW_PORT;
const BACK = $BACKEND_PORT;
const VITE = $VITE_PORT;

function proxyReq(req, res, port) {
  let attempts = 0;
  function attempt() {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:' + port }
    };
    const p = http.request(opts, r => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res, { end: true });
    });
    p.on('error', () => {
      if (++attempts < 40) { setTimeout(attempt, 300); }
      else { res.writeHead(502); res.end('Service starting...'); }
    });
    req.pipe(p, { end: true });
  }
  attempt();
}

const srv = http.createServer((req, res) => {
  const url = req.url || '/';
  const isApi = url.startsWith('/wa-gateway/api') || url.startsWith('/wa-gateway/api/');
  proxyReq(req, res, isApi ? BACK : VITE);
});

srv.on('upgrade', (req, socket, head) => {
  const target = net.connect(VITE, '127.0.0.1');
  target.once('connect', () => {
    target.write(
      req.method + ' ' + req.url + ' HTTP/1.1\r\n' +
      Object.entries(req.headers).map(([k,v]) => k+': '+v).join('\r\n') +
      '\r\n\r\n'
    );
    if (head?.length) target.write(head);
    target.pipe(socket, { end: true });
    socket.pipe(target, { end: true });
  });
  target.on('error', () => socket.destroy());
});

srv.listen(GW, '0.0.0.0', () => {
  console.log('[wa-gateway] proxy :' + GW + ' → api=:' + BACK + ' client=:' + VITE);
});
setInterval(() => {}, 1000);
" &
PROXY_PID=$!

trap "kill \$BACKEND_PID \$VITE_PID \$PROXY_PID 2>/dev/null; exit" TERM INT

wait $BACKEND_PID
kill $VITE_PID $PROXY_PID 2>/dev/null || true
