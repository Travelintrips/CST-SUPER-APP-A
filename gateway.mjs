/**
 * Unified dev gateway — listens on PORT (default 5000) and reverse-proxies
 * every request to the correct upstream based on the path prefix.
 *
 * Route table:
 *   /api/*          → API Server      :8080
 *   /pos-images/*   → API Server      :8080
 *   /q/*            → API Server      :8080  (short-link redirects)
 *   /bizportal/*    → BizPortal       :3000
 *   /sport-center/* → Sport Center    :3002
 *   /*              → Customer Portal :3001
 *
 * WebSocket upgrades are also proxied (needed for Vite HMR when accessed
 * through this gateway port).
 */

import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 5000);

const ROUTES = [
  { prefix: "/api",          upstream: { host: "localhost", port: 8080 } },
  { prefix: "/pos-images",   upstream: { host: "localhost", port: 8080 } },
  { prefix: "/q",            upstream: { host: "localhost", port: 8080 } },
  { prefix: "/bizportal",    upstream: { host: "localhost", port: 3000 } },
  { prefix: "/sport-center", upstream: { host: "localhost", port: 3002 } },
];
const DEFAULT_UPSTREAM = { host: "localhost", port: 3001 }; // Customer Portal

function resolve(url) {
  for (const route of ROUTES) {
    if (url === route.prefix || url.startsWith(route.prefix + "/") || url.startsWith(route.prefix + "?")) {
      return route.upstream;
    }
  }
  return DEFAULT_UPSTREAM;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const upstream = resolve(req.url ?? "/");

  const options = {
    hostname: upstream.host,
    port:     upstream.port,
    path:     req.url,
    method:   req.method,
    headers: {
      ...req.headers,
      host: `${upstream.host}:${upstream.port}`,
    },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    const msg = `Gateway: upstream ${upstream.host}:${upstream.port} unavailable — ${err.message}`;
    console.error(msg);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(msg);
    }
  });

  req.pipe(proxy, { end: true });
});

// ── WebSocket upgrade (Vite HMR) ──────────────────────────────────────────────
server.on("upgrade", (req, socket, head) => {
  const upstream = resolve(req.url ?? "/");

  const tunnel = net.connect(upstream.port, upstream.host, () => {
    tunnel.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") +
      "\r\n\r\n"
    );
    if (head?.length) tunnel.write(head);
  });

  tunnel.on("error", (err) => {
    console.error(`Gateway WS: tunnel error — ${err.message}`);
    socket.destroy();
  });

  socket.on("error", () => tunnel.destroy());
  tunnel.pipe(socket, { end: true });
  socket.pipe(tunnel, { end: true });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway listening on port ${PORT}`);
  console.log(`  /api/*          → :8080 (API Server)`);
  console.log(`  /bizportal/*    → :3000 (BizPortal)`);
  console.log(`  /sport-center/* → :3002 (Sport Center)`);
  console.log(`  /*              → :3001 (Customer Portal)`);
});
