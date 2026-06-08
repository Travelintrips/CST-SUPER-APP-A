#!/bin/bash
GW_PORT=${BIZPORTAL_PORT:-6800}
VITE_PORT=${PORT:-3000}

node "$(dirname "$0")/../api-server/kill-port.mjs" "${VITE_PORT}" "${GW_PORT}" 2>/dev/null || true
sleep 0.3

export PORT=$VITE_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}

# Start proxy synchronously on GW_PORT before Vite starts
node -e "
const http = require('http');
const GW = $GW_PORT;
const UP = $VITE_PORT;
function tryProxy(req, res) {
  let retries = 0;
  function attempt() {
    const opts = { hostname: '127.0.0.1', port: UP, path: req.url, method: req.method, headers: req.headers };
    const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
    p.on('error', () => { if (++retries < 30) { setTimeout(attempt, 300); } else { res.writeHead(502); res.end('BizPortal starting...'); } });
    req.pipe(p, {end:true});
  }
  attempt();
}
http.createServer(tryProxy).listen(GW, '0.0.0.0', () => {
  console.log('[bizportal] proxy :' + GW + ' -> :' + UP);
  // Signal to parent that proxy is ready
  process.stdout.write('PROXY_READY\n');
});
// Keep running indefinitely
setInterval(() => {}, 1000);
" &
PROXY_PID=$!

# Wait for proxy to confirm it's listening
timeout 10 bash -c "while ! node -e \"const net=require('net');const s=net.connect($GW_PORT,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1))\" 2>/dev/null; do sleep 0.2; done"

# Start Vite as main process
exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${VITE_PORT}"
