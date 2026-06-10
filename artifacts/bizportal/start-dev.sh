#!/bin/bash
ARTIFACT_PORT=${BIZPORTAL_PORT:-${PORT:-6800}}
GATEWAY_PORT=4200

node "$(dirname "$0")/../api-server/kill-port.mjs" "${ARTIFACT_PORT}" 2>/dev/null || true
node "$(dirname "$0")/../api-server/kill-port.mjs" "${GATEWAY_PORT}" 2>/dev/null || true
cd "$(dirname "$0")"

GW_PORT=${BIZPORTAL_PORT:-6800}
VITE_PORT=${BIZPORTAL_PORT:-${PORT:-6800}}

cd "$(dirname "$0")"

node "../api-server/kill-port.mjs" "${VITE_PORT}" "${GW_PORT}" 2>/dev/null || true
sleep 0.3

export PORT=$VITE_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

# Start HTTP proxy on GW_PORT → VITE_PORT so Gateway can reach BizPortal
node -e "
const http = require('http');
const GW = $GW_PORT;
const UP = $VITE_PORT;
function tryProxy(req, res) {
  let retries = 0;
  function attempt() {
    const opts = { hostname: '127.0.0.1', port: UP, path: req.url, method: req.method, headers: req.headers };
    const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
    p.on('error', () => { if (++retries < 40) { setTimeout(attempt, 300); } else { res.writeHead(502); res.end('BizPortal starting...'); } });
    req.pipe(p, {end:true});
  }
  attempt();
}
http.createServer(tryProxy).listen(GW, '0.0.0.0', () => {
  process.stdout.write('[bizportal] proxy :' + GW + ' -> :' + UP + '\n');
});
setInterval(() => {}, 1000);
" &
PROXY_PID=$!

# Wait for proxy to be listening before starting Vite
timeout 8 bash -c "while ! node -e \"const net=require('net');const s=net.connect($GW_PORT,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1))\" 2>/dev/null; do sleep 0.2; done"

trap "kill \$PROXY_PID 2>/dev/null; exit" TERM INT

# Start Vite (no exec — proxy must keep running alongside it)
pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${VITE_PORT}"

kill $PROXY_PID 2>/dev/null
