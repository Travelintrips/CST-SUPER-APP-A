#!/bin/bash
ARTIFACT_PORT=${PORT:-3001}

fuser -k 3001/tcp 2>/dev/null || true
[ "$ARTIFACT_PORT" != "3001" ] && fuser -k "${ARTIFACT_PORT}/tcp" 2>/dev/null || true
sleep 0.2

# If Replit assigned a non-3001 port, open it immediately with an HTTP forward proxy.
# This satisfies Replit's "did the port open?" check before the 60-second timeout.
# Never proxy on port 5000 — that port is reserved for the Gateway (main webview).
if [ "$ARTIFACT_PORT" != "3001" ] && [ "$ARTIFACT_PORT" != "5000" ]; then
  node -e "
const http = require('http');
let retries = 0;
function tryProxy(req, res) {
  const opts = { hostname: '127.0.0.1', port: 3001, path: req.url, method: req.method, headers: req.headers };
  const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
  p.on('error', () => { if (++retries < 3) { setTimeout(() => tryProxy(req,res), 500); } else { res.writeHead(502); res.end('Starting...'); } });
  req.pipe(p, {end:true});
}
http.createServer(tryProxy).listen($ARTIFACT_PORT, '0.0.0.0', () => {
  console.log('[customer-portal] HTTP proxy :$ARTIFACT_PORT -> :3001');
});
" &
  sleep 0.5
fi

export PORT=3001
export BASE_PATH=${BASE_PATH:-/}

exec node_modules/.bin/vite --config vite.config.ts --host 0.0.0.0
