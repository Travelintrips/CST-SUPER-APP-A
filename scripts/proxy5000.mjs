import http from "http";
import { execSync } from "child_process";

try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

const API_PORT = 8080;
const FRONTEND_PORT = 3000;

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: "localhost",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
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
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (
    url.startsWith("/api/") ||
    url === "/api" ||
    url.startsWith("/bizportal") ||
    url.startsWith("/logistic-order")
  ) {
    proxyRequest(req, res, API_PORT);
  } else {
    proxyRequest(req, res, FRONTEND_PORT);
  }
});

server.listen(5000, "0.0.0.0", () => {
  console.log(`Proxy running: port 5000 → frontend :${FRONTEND_PORT} + api :${API_PORT}`);
});
