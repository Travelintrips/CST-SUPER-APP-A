import http from "http";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}
try { execSync("fuser -k 8080/tcp", { stdio: "ignore" }); } catch {}

];

function resolveUpstream(url) {
  const path = url.split("?")[0];

  if (path === "/bizportal" || path.startsWith("/bizportal/")) {
    return 18442;
  }
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
});