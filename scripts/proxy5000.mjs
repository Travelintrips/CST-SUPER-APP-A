import http from "http";
import { execSync } from "child_process";

try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

const API_PREFIXES = [
  "/api/",
  "/login",
  "/logout",
  "/callback",
  "/auth",
  "/mobile-auth",
  "/pos-images",
];

function resolveUpstream(url) {
  const path = url.split("?")[0];

  if (path === "/bizportal" || path.startsWith("/bizportal/")) {
    return 18442;
  }

  if (API_PREFIXES.some((p) => path === p.trimEnd() || path.startsWith(p))) {
    return 8080;
  }

  return 3000;
}

const server = http.createServer((req, res) => {
  const upstreamPort = resolveUpstream(req.url ?? "/");
  const options = {
    hostname: "localhost",
    port: upstreamPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${upstreamPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on("error", (err) => {
    res.writeHead(502);
    res.end("Bad Gateway: " + err.message);
  });
  req.pipe(proxy, { end: true });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Proxy running: port 5000 → /bizportal/* → :18442, /api/* → :8080, /* → :3000");
});
