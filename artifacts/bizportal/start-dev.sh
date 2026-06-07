#!/bin/bash
# Replit assigns PORT (e.g. 18442) — Vite runs there for waitForPort check
# Gateway expects BIZPORTAL_PORT (default 3000) — we proxy that → Vite port
VITE_PORT=${PORT:-3000}
GW_PORT=${BIZPORTAL_PORT:-6800}

# If Vite is already healthy on VITE_PORT (another workflow owns it), don't kill it.
ALREADY_RUNNING=false
if node -e "
const http = require('http');
const req = http.request(
  { hostname: '127.0.0.1', port: ${VITE_PORT}, path: '/bizportal/', method: 'HEAD', timeout: 1500 },
  (r) => process.exit(r.statusCode < 500 ? 0 : 1)
);
req.on('error',   () => process.exit(1));
req.on('timeout', () => process.exit(1));
req.end();
" 2>/dev/null; then
  ALREADY_RUNNING=true
fi

if [ "$ALREADY_RUNNING" = "true" ]; then
  echo "[bizportal] Port ${VITE_PORT} already serving — running in stand-by mode."
  # Keep process alive so Replit doesn't restart in a tight loop
  while true; do sleep 60; done
fi

# --- Primary startup (no existing server found) ---
node "$(dirname "$0")/../api-server/kill-port.mjs" "${VITE_PORT}" "${GW_PORT}" 2>/dev/null || true
sleep 0.3

# If Replit gave us a different port than Gateway expects, run a proxy
if [ "$VITE_PORT" != "$GW_PORT" ]; then
  node -e "
const http = require('http');
function tryProxy(req, res) {
  let retries = 0;
  function attempt() {
    const opts = { hostname: '127.0.0.1', port: $VITE_PORT, path: req.url, method: req.method, headers: req.headers };
    const p = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res, {end:true}); });
    p.on('error', () => { if (++retries < 5) { setTimeout(attempt, 600); } else { res.writeHead(502); res.end('BizPortal starting...'); } });
    req.pipe(p, {end:true});
  }
  attempt();
}
http.createServer(tryProxy).listen($GW_PORT, '0.0.0.0', () => {
  console.log('[bizportal] proxy :$GW_PORT -> :$VITE_PORT');
});
" &
  sleep 0.5
fi

export PORT=$VITE_PORT
export BASE_PATH=${BASE_PATH:-/bizportal/}
exec pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port "${VITE_PORT}"
