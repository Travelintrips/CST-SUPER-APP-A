/**
 * Unified dev gateway — listens on PORT (default 5000) and reverse-proxies
 * every request to the correct upstream based on the path prefix.
 *
 * Route table:
 *   /api/*             → API Server      :8080
 *   /pos-images/*      → API Server      :8080
 *   /q/*               → API Server      :8080  (short-link redirects)
 *   /s/*               → API Server      :8080
 *   /bizportal/*       → BizPortal       :18442

 *   /sport-center/*    → 302 redirect to /bizportal/sport-center/* (served by BizPortal React Router)

 *   /customer-portal/* → redirect strip prefix
 *   /*                 → Customer Portal :5173
 *
 * Retry behaviour:
 *   When an upstream is not yet ready (ECONNREFUSED / ECONNRESET / ETIMEDOUT),
 *   the gateway retries with exponential backoff instead of returning 502 immediately.
 *   - Retries: up to MAX_ATTEMPTS (default 8)
 *   - Backoff:  200 ms × 2^attempt + jitter, capped at BACKOFF_CAP_MS (2 s)
 *   - Total max wait: ~15 s before giving up with a 503 "Starting…" page
 *
 * WebSocket upgrades are also proxied (needed for Vite HMR).
 */

import http from "node:http";
import net  from "node:net";

const PORT          = Number(process.env.PORT ?? 5000);
const MAX_ATTEMPTS  = Number(process.env.GW_MAX_ATTEMPTS  ?? 8);
const BACKOFF_CAP   = Number(process.env.GW_BACKOFF_CAP   ?? 2000);
const BASE_DELAY    = Number(process.env.GW_BASE_DELAY    ?? 200);

const RETRYABLE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"]);

const API_PORT           = Number(process.env.API_PORT           ?? 8080);
// BizPortal Vite runs at 18442 (Replit artifact workflow)
const BIZPORTAL_PORT     = Number(process.env.BIZPORTAL_PORT     ?? 18442);
// Customer portal Vite runs at 5174 (internal; Replit artifact proxies at 23434)
const CUSTOMER_PORT      = Number(process.env.CUSTOMER_PORT      ?? 5174);
// Logistic Order Vite runs at 19368 (Replit artifact workflow)
const LOGISTIC_ORDER_PORT = Number(process.env.LOGISTIC_ORDER_PORT ?? 19368);

const ROUTES = [
  { prefix: "/api",             upstream: { host: "localhost", port: API_PORT } },
  { prefix: "/pos-images",      upstream: { host: "localhost", port: API_PORT } },
  { prefix: "/q",               upstream: { host: "localhost", port: API_PORT } },
  { prefix: "/s",               upstream: { host: "localhost", port: API_PORT } },
  { prefix: "/bizportal",       upstream: { host: "localhost", port: BIZPORTAL_PORT } },
  { prefix: "/logistic-order",  upstream: { host: "localhost", port: LOGISTIC_ORDER_PORT } },
  // /sport-center/* → redirect to BizPortal React Router — no separate service on :3002
  { prefix: "/sport-center",    upstream: null, redirectMapTo: "/bizportal/sport-center",   redirectDefaultSuffix: "/dashboard" },

  // BizPortal sub-paths accessed without /bizportal/ prefix → redirect
  // Core modules
  { prefix: "/sales",               upstream: null, redirectMapTo: "/bizportal/sales",               redirectDefaultSuffix: "/documents" },
  { prefix: "/purchase",            upstream: null, redirectMapTo: "/bizportal/purchase",             redirectDefaultSuffix: "/documents" },
  { prefix: "/logistics",           upstream: null, redirectMapTo: "/bizportal/logistics",            redirectDefaultSuffix: "/" },
  { prefix: "/accounting",          upstream: null, redirectMapTo: "/bizportal/accounting",           redirectDefaultSuffix: "/journals" },
  { prefix: "/settings",            upstream: null, redirectMapTo: "/bizportal/settings",             redirectDefaultSuffix: "/" },
  // Reports & analytics
  { prefix: "/reports",             upstream: null, redirectMapTo: "/bizportal/reports",              redirectDefaultSuffix: "/operasional" },
  { prefix: "/analytics",           upstream: null, redirectMapTo: "/bizportal/analytics",            redirectDefaultSuffix: "/" },
  { prefix: "/holding",             upstream: null, redirectMapTo: "/bizportal/holding",              redirectDefaultSuffix: "/" },
  // Expenses
  { prefix: "/expense",             upstream: null, redirectMapTo: "/bizportal/expense",              redirectDefaultSuffix: "/" },
  { prefix: "/expenses",            upstream: null, redirectMapTo: "/bizportal/expense",              redirectDefaultSuffix: "/" },
  // Dashboard & general
  { prefix: "/dashboard",           upstream: null, redirectMapTo: "/bizportal/dashboard",            redirectDefaultSuffix: "/" },
  { prefix: "/ceo-dashboard",       upstream: null, redirectMapTo: "/bizportal/ceo-dashboard",        redirectDefaultSuffix: "/" },
  { prefix: "/enterprise-dashboard",upstream: null, redirectMapTo: "/bizportal/enterprise-dashboard", redirectDefaultSuffix: "/" },
  { prefix: "/operational-dashboard",upstream: null,redirectMapTo: "/bizportal/operational-dashboard",redirectDefaultSuffix: "/" },
  { prefix: "/approvals",           upstream: null, redirectMapTo: "/bizportal/approvals",            redirectDefaultSuffix: "/" },
  { prefix: "/notifications",       upstream: null, redirectMapTo: "/bizportal/notifications",        redirectDefaultSuffix: "/" },
  { prefix: "/exceptions",          upstream: null, redirectMapTo: "/bizportal/exceptions",           redirectDefaultSuffix: "/" },
  // Correspondence & communication
  { prefix: "/correspondences",     upstream: null, redirectMapTo: "/bizportal/correspondences",      redirectDefaultSuffix: "/" },
  { prefix: "/email-inbox",         upstream: null, redirectMapTo: "/bizportal/email-inbox",          redirectDefaultSuffix: "/" },
  { prefix: "/notification-history",upstream: null, redirectMapTo: "/bizportal/notification-history", redirectDefaultSuffix: "/" },
  // Users, org & media
  { prefix: "/users",               upstream: null, redirectMapTo: "/bizportal/users",                redirectDefaultSuffix: "/" },
  { prefix: "/org",                 upstream: null, redirectMapTo: "/bizportal/org",                  redirectDefaultSuffix: "/" },
  { prefix: "/media",               upstream: null, redirectMapTo: "/bizportal/media",                redirectDefaultSuffix: "/" },
  // Products & catalog
  { prefix: "/products",            upstream: null, redirectMapTo: "/bizportal/products",             redirectDefaultSuffix: "/items" },
  { prefix: "/product-templates",   upstream: null, redirectMapTo: "/bizportal/product-templates",    redirectDefaultSuffix: "/" },
  { prefix: "/katalog-terpadu",     upstream: null, redirectMapTo: "/bizportal/katalog-terpadu",      redirectDefaultSuffix: "/" },
  { prefix: "/vendors",             upstream: null, redirectMapTo: "/bizportal/vendors",              redirectDefaultSuffix: "/" },
  // Commerce & trading
  { prefix: "/ecommerce",           upstream: null, redirectMapTo: "/bizportal/ecommerce",            redirectDefaultSuffix: "/" },
  { prefix: "/trading",             upstream: null, redirectMapTo: "/bizportal/trading",              redirectDefaultSuffix: "/" },
  // Audit & AI
  { prefix: "/audit",               upstream: null, redirectMapTo: "/bizportal/audit",                redirectDefaultSuffix: "/" },
  { prefix: "/intelligence-alerts", upstream: null, redirectMapTo: "/bizportal/intelligence-alerts",  redirectDefaultSuffix: "/" },
  { prefix: "/ai-approvals",        upstream: null, redirectMapTo: "/bizportal/ai-approvals",         redirectDefaultSuffix: "/" },

  // POS / Kasir — /pos is a legacy alias that redirects to /kasir
  { prefix: "/kasir",           upstream: null, redirectMapTo: "/bizportal/kasir",            redirectDefaultSuffix: "/" },
  { prefix: "/pos",             upstream: null, redirectMapTo: "/kasir",                      redirectDefaultSuffix: "/" },

  // Canvas artifact iframe hits /customer-portal/* — redirect to strip the prefix
  { prefix: "/customer-portal", upstream: null, redirectStrip: "/customer-portal" },
];
const DEFAULT_UPSTREAM = { host: "localhost", port: CUSTOMER_PORT };

const SERVICE_NAMES = {
  [API_PORT]:            "API Server",
  [BIZPORTAL_PORT]:      "BizPortal",
  [CUSTOMER_PORT]:       "Customer Portal",
  [LOGISTIC_ORDER_PORT]: "Logistic Order",
};

function resolve(url) {
  for (const route of ROUTES) {
    if (url === route.prefix || url.startsWith(route.prefix + "/") || url.startsWith(route.prefix + "?")) {
      return {
        upstream:              route.upstream ?? null,
        stripPrefix:           route.stripPrefix          ?? null,
        redirectStrip:         route.redirectStrip        ?? null,
        redirectMapTo:         route.redirectMapTo        ?? null,
        redirectDefaultSuffix: route.redirectDefaultSuffix ?? "/",
        matchedPrefix:         route.prefix,
      };
    }
  }
  return { upstream: DEFAULT_UPSTREAM, stripPrefix: null, redirectStrip: null, redirectMapTo: null, redirectDefaultSuffix: "/", matchedPrefix: null };
}

function rewritePath(url, stripPrefix) {
  if (!stripPrefix) return url;
  if (url === stripPrefix) return "/";
  if (url.startsWith(stripPrefix + "/")) return url.slice(stripPrefix.length) || "/";
  if (url.startsWith(stripPrefix + "?")) return "/" + url.slice(stripPrefix.length);
  return url;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function backoffMs(attempt) {
  const exp    = BASE_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY;
  return Math.min(exp + jitter, BACKOFF_CAP);
}

function startingPage(port, attempt) {
  const name = SERVICE_NAMES[port] ?? `upstream :${port}`;
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="3">
  <title>Menunggu ${name}…</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;
         font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
    .card{text-align:center;padding:2.5rem 3rem;background:#1e293b;
          border-radius:1rem;border:1px solid #334155;max-width:420px}
    .spinner{width:48px;height:48px;border:4px solid #334155;
             border-top-color:#38bdf8;border-radius:50%;margin:0 auto 1.5rem;
             animation:spin 0.9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:1.125rem;font-weight:600;color:#f8fafc;margin-bottom:.5rem}
    p{font-size:.875rem;color:#94a3b8;line-height:1.6}
    .attempt{margin-top:1rem;font-size:.75rem;color:#475569}
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>${name} sedang starting…</h1>
    <p>Gateway menunggu upstream siap.<br>Halaman akan refresh otomatis.</p>
    <div class="attempt">Percobaan ${attempt} / ${MAX_ATTEMPTS} — port ${port}</div>
  </div>
</body>
</html>`;
}

// ── HTTP proxy with retry ─────────────────────────────────────────────────────

function proxyAttempt(req, upstream, body, rewrittenPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: upstream.host,
      port:     upstream.port,
      path:     rewrittenPath ?? req.url,
      method:   req.method,
      headers: {
        ...req.headers,
        host: `${upstream.host}:${upstream.port}`,
      },
    };

    const proxy = http.request(options, resolve);
    proxy.on("error", reject);
    if (body?.length) proxy.write(body);
    proxy.end();
  });
}

// ── Request handler ───────────────────────────────────────────────────────────

function handleRequest(req, res) {
  const { upstream, stripPrefix, redirectStrip, redirectMapTo, redirectDefaultSuffix, matchedPrefix } = resolve(req.url ?? "/");

  // Redirect-strip: browser URL must change so client-side router sees correct path
  if (redirectStrip) {
    const target = rewritePath(req.url ?? "/", redirectStrip);
    res.writeHead(302, { location: target });
    res.end();
    return;
  }

  // Redirect-map: rewrite prefix to a different base path (e.g. /sport-center/* → /bizportal/sport-center/*)
  if (redirectMapTo) {
    const url = req.url ?? "/";
    const suffix = matchedPrefix ? url.slice(matchedPrefix.length) : "";
    const target = (!suffix || suffix === "/") ? (redirectMapTo + redirectDefaultSuffix) : (redirectMapTo + suffix);
    res.writeHead(302, { location: target });
    res.end();
    return;
  }

  const rewrittenPath = rewritePath(req.url ?? "/", stripPrefix);
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    let lastErr;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const proxyRes = await proxyAttempt(req, upstream, body, rewrittenPath);
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
        return;
      } catch (err) {
        lastErr = err;
        if (!RETRYABLE_CODES.has(err.code)) break;
        const wait = backoffMs(attempt);
        if (attempt === 0) {
          console.warn(`[gw] ${upstream.port} not ready (${err.code}), retrying… (${req.method} ${req.url})`);
        }
        await delay(wait);
      }
    }
    const port = upstream.port;
    const isApi = req.url?.startsWith("/api");
    console.error(`[gw] upstream :${port} unreachable after ${MAX_ATTEMPTS} attempts — ${lastErr?.message}`);
    if (!res.headersSent) {
      if (isApi) {
        res.writeHead(503, { "content-type": "application/json", "retry-after": "5" });
        res.end(JSON.stringify({
          error: "upstream_not_ready",
          message: `${SERVICE_NAMES[port] ?? `upstream :${port}`} belum siap, coba lagi beberapa saat.`,
          port,
        }));
      } else {
        res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
        res.end(startingPage(port, MAX_ATTEMPTS));
      }
    }
  });
}

// ── WebSocket upgrade with retry ──────────────────────────────────────────────

function wsConnect(upstream) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(upstream.port, upstream.host);
    sock.once("connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

async function handleUpgrade(req, socket, head) {
  const { upstream } = resolve(req.url ?? "/");
  if (!upstream) { socket.destroy(); return; }
  let tunnel, lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      tunnel = await wsConnect(upstream);
      break;
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE_CODES.has(err.code)) break;
      await delay(backoffMs(attempt));
    }
  }
  if (!tunnel) {
    console.error(`[gw] WS: upstream :${upstream.port} unreachable — ${lastErr?.message}`);
    socket.destroy();
    return;
  }
  tunnel.write(
    `${req.method} ${req.url} HTTP/1.1\r\n` +
    Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
    "\r\n\r\n"
  );
  if (head?.length) tunnel.write(head);
  tunnel.on("error", (err) => { console.error(`[gw] WS tunnel error — ${err.message}`); socket.destroy(); });
  socket.on("error", () => tunnel.destroy());
  tunnel.pipe(socket, { end: true });
  socket.pipe(tunnel, { end: true });
}

// ── Start with retry on EADDRINUSE ────────────────────────────────────────────

async function startGateway() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const started = await new Promise((resolve) => {
      const srv = http.createServer(handleRequest);
      srv.on("upgrade", handleUpgrade);
      srv.once("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`[gw] Port ${PORT} busy, retrying in 1s… (attempt ${attempt + 1}/20)`);
          srv.close();
          resolve(false);
        } else {
          console.error(`[gw] Fatal server error: ${err.message}`);
          process.exit(1);
        }
      });
      srv.listen(PORT, () => {
        console.log(`Gateway listening on port ${PORT}`);
        console.log(`  /api/*             → :${API_PORT} (API Server)`);
        console.log(`  /bizportal/*       → :${BIZPORTAL_PORT} (BizPortal)`);
        console.log(`  /logistic-order/*  → :${LOGISTIC_ORDER_PORT} (Logistic Order)`);
        console.log(`  /sport-center/*    → 302 /bizportal/sport-center/* (BizPortal React Router)`);
        console.log(`  /*                 → :${CUSTOMER_PORT} (Customer Portal)`);
        resolve(true);
      });
    });
    if (started) return;
    await delay(1000);
  }
  console.error(`[gw] Could not bind port ${PORT} after 20 attempts`);
  process.exit(1);
}

startGateway();

// NOTE: EXTRA_PORT (23434) mirror listener is disabled.
// The customer-portal start-dev.sh runs kill-port on 23434 at startup, which would
// kill the gateway process if it owned that port. Port 23434 is used by the
// customer-portal's internal HTTP proxy (Vite on 5174 → proxy on 23434).
