import http from "http";
import { execSync } from "child_process";

// Kill anything on port 5000 first
try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

// Route rules: requests matching pathPrefix go to the given upstream port.
// Rules are checked in order; first match wins.
const ROUTES = [
  { prefix: "/bizportal/",  port: 18442 },
  { prefix: "/bizportal",   port: 18442 },
  { prefix: "/",            port: 8080  },
];

function resolveUpstream(url) {
  for (const { prefix, port } of ROUTES) {
    if (url === prefix.trimEnd() || url.startsWith(prefix)) {
      return port;
    }
  }
  return 8080;
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
  console.log("Proxy running: port 5000 → /bizportal/* → :18442, /* → :8080");
});
