import http from "http";
import net from "net";
import { execSync } from "child_process";

try { execSync("fuser -k 5000/tcp 2>/dev/null", { stdio: "ignore" }); } catch {}
await new Promise(r => setTimeout(r, 500));

const API_PORT = 8080;
const BIZPORTAL_PORT = 18442;
const CUSTOMER_PORTAL_PORT = 3001;

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

function proxyWebSocket(req, socket, head, port) {
  const target = net.createConnection(port, "localhost", () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    target.write(
      `${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`
    );
    if (head && head.length) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  target.on("error", () => { try { socket.destroy(); } catch {} });
  socket.on("error", () => { try { target.destroy(); } catch {} });
}

function getTargetPort(url, headers) {
  if (
    url.startsWith("/api/") ||
    url === "/api" ||
    url.startsWith("/logistic-order/api") ||
    url.startsWith("/auth/")
  ) return API_PORT;
  if (url.startsWith("/bizportal") || url.startsWith("/bizportal/")) return BIZPORTAL_PORT;
  // Route Vite HMR WebSocket (/?token=) to the right portal based on Referer header
  if (headers && headers.referer) {
    if (headers.referer.includes("/bizportal")) return BIZPORTAL_PORT;
  }
  return CUSTOMER_PORTAL_PORT;
}

const server = http.createServer((req, res) => {
  proxyRequest(req, res, getTargetPort(req.url || "/", req.headers));
});

server.on("upgrade", (req, socket, head) => {
  proxyWebSocket(req, socket, head, getTargetPort(req.url || "/", req.headers));
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Proxy listening on :5000");
  console.log(`  /bizportal/* -> :${BIZPORTAL_PORT}`);
  console.log(`  /api/* -> :${API_PORT}`);
  console.log(`  /* -> :${CUSTOMER_PORTAL_PORT}`);
});
