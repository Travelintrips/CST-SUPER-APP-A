#!/bin/bash
ARTIFACT_PORT=${PORT:-3001}
INTERNAL_PORT=${INTERNAL_PORT:-5173}

node "$(dirname "$0")/../api-server/kill-port.mjs" "$INTERNAL_PORT" "$ARTIFACT_PORT" 2>/dev/null || true
sleep 0.2

if [ "$ARTIFACT_PORT" != "$INTERNAL_PORT" ]; then
  node -e "
const http = require('http');
let retries = 0;
function tryProxy(req, res) {
  const opts = { hostname: '127.0.0.1', port: $INTERNAL_PORT, path: req.url, method: req.method, headers: req.headers };
  const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
  p.on('error', () => { if (++retries < 3) { setTimeout(() => tryProxy(req,res), 500); } else { res.writeHead(502); res.end('Starting...'); } });
  req.pipe(p, {end:true});
}
http.createServer(tryProxy).listen($ARTIFACT_PORT, '0.0.0.0', () => {
  console.log('[customer-portal] HTTP proxy :$ARTIFACT_PORT -> :$INTERNAL_PORT');
});
" &
  sleep 0.5
fi

export PORT=$INTERNAL_PORT
export BASE_PATH=${BASE_PATH:-/}

exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port $INTERNAL_PORT
