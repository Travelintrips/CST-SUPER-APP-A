import http from "http";
import { execSync } from "child_process";

// Kill anything on port 5000 first
try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

const server = http.createServer((req, res) => {
  const options = {
    hostname: "localhost",
    port: 8080,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: "localhost:8080" },
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
  console.log("Proxy running: port 5000 → http://localhost:8080");
});
