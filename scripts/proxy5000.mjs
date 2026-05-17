import http from "http";
import net from "net";
import { execSync } from "child_process";

try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}

const API_PORT = 8080;
const CUSTOMER_PORTAL_PORT = 3000;
const BIZPORTAL_PORTS = [18442, 18443, 18444];

function probePort(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "localhost" });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.setTimeout(300, () => { s.destroy(); resolve(false); });
  });
}

async function getBizportalPort() {
  for (const p of BIZPORTAL_PORTS) {
    if (await probePort(p)) return p;
  }
  return BIZPORTAL_PORTS[0];
}

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
    target.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      "\r\n\r\n"
    );
    if (head && head.length) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
}

let bizportalPort = BIZPORTAL_PORTS[0];
getBizportalPort().then((p) => {
  bizportalPort = p;
  console.log(`Proxy: bizportal detected on :${p}`);
});

setInterval(async () => {
  bizportalPort = await getBizportalPort();
}, 10000);

function getTargetPort(url) {
  if (
    url.startsWith("/api/") ||
    url === "/api" ||
    url.startsWith("/logistic-order/api") ||
    url.startsWith("/auth/")
  ) return API_PORT;
  if (url.startsWith("/bizportal") || url.startsWith("/bizportal/")) return bizportalPort;
  return CUSTOMER_PORTAL_PORT;
}

const server = http.createServer((req, res) => {
  proxyRequest(req, res, getTargetPort(req.url || "/"));
});

server.on("upgrade", (req, socket, head) => {
  proxyWebSocket(req, socket, head, getTargetPort(req.url || "/"));
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Proxy listening on :5000");
});
