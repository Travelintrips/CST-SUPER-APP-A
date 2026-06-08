#!/bin/bash
# BizPortal startup script
# When BIZPORTAL_PORT is set: proxy listens on BIZPORTAL_PORT, Vite on internal port
# When BIZPORTAL_PORT is not set: Vite listens on PORT directly

GW_PORT=${BIZPORTAL_PORT:-6800}
VITE_PORT=${PORT:-3000}

# Kill stale processes on both ports
node "$(dirname "$0")/../api-server/kill-port.mjs" "${VITE_PORT}" "${GW_PORT}" 2>/dev/null || true
sleep 0.3

# Start proxy FIRST (before Vite) so Replit's waitForPort check passes immediately
if [ "$VITE_PORT" != "$GW_PORT" ]; then
  node -e "
const http = require('http');
function tryProxy(req, res) {
  let retries = 0;
  function attempt() {
    const opts = { hostname: '127.0.0.1', port: $VITE_PORT, path: req.url, method: req.method, headers: req.headers };
    const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
    p.on('error', () => { if (++retries < 10) { setTimeout(attempt, 500); } else { res.writeHead(502); res.end('BizPortal starting...'); } });
    req.pipe(p, {end:true});
  }
  attempt();
}
http.createServer(tryProxy).listen($GW_PORT, '0.0.0.0', () => {
  console.log('[bizportal] proxy :$GW_PORT -> :$VITE_PORT');
});
" &
  PROXY_PID=$!
  sleep 0.5
fi

export PORT=$VITE_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}
exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${VITE_PORT}"
