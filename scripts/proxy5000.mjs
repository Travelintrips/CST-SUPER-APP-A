import http from "http";
import { execSync } from "child_process";

try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

const API_PORT = 8080;
const BIZPORTAL_PORT = 18442;
const CUSTOMER_PORTAL_PORT = 3000;

function proxyRequest(req, res, port) {
  const options = {
    hostname: "localhost",
    port,
    path: req.url,
    method: req.method,
    headers: req.headers,
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
    url.startsWith("/logistic-order/api") ||
    url.startsWith("/auth/")
  ) {
    proxyRequest(req, res, API_PORT);
  } else if (url.startsWith("/bizportal") || url.startsWith("/bizportal/")) {
    proxyRequest(req, res, BIZPORTAL_PORT);
  } else {
    proxyRequest(req, res, CUSTOMER_PORTAL_PORT);
  }
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Proxy listening on :5000");
});
