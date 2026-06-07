#!/bin/bash
# When BIZPORTAL_PORT is set (main "BizPortal" workflow):
#   - Proxy listens on BIZPORTAL_PORT (e.g. 6800) — Gateway routes here
#   - Vite listens on a fixed internal port (18446) so it never conflicts
#     with the artifact-managed workflow that Replit auto-assigns PORT=18442
# When BIZPORTAL_PORT is NOT set (artifact workflow, Replit assigns PORT):
#   - No proxy; Vite listens on PORT (e.g. 18442)
if [ -n "$BIZPORTAL_PORT" ]; then
  GW_PORT="${BIZPORTAL_PORT}"
  VITE_PORT=18446
else
  GW_PORT="${PORT:-3000}"
  VITE_PORT="${PORT:-3000}"
fi

node "$(dirname "$0")/../api-server/kill-port.mjs" "${VITE_PORT}" "${GW_PORT}" 2>/dev/null || true
sleep 0.3

# Proxy GW_PORT → VITE_PORT when they differ
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
