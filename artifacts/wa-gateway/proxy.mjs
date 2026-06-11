import http from "http";
import net from "net";

const GW   = Number(process.env.GW_PORT   ?? 8000);
const BACK = Number(process.env.BACK_PORT ?? 21173);
const VITE = Number(process.env.VITE_PORT ?? 21174);

function proxyReq(req, res, port) {
  let attempts = 0;
  function attempt() {
    const opts = {
      hostname: "127.0.0.1",
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: "127.0.0.1:" + port },
    };
    const p = http.request(opts, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res, { end: true });
    });
    p.on("error", () => {
      if (++attempts < 40) { setTimeout(attempt, 300); }
      else { res.writeHead(502); res.end("Service starting..."); }
    });
    req.pipe(p, { end: true });
  }
  attempt();
}

const srv = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url === "/wa-gateway" || url === "/") {
    res.writeHead(302, { Location: "/wa-gateway/" });
    res.end();
    return;
  }
  const isApi = url.startsWith("/wa-gateway/api");
  proxyReq(req, res, isApi ? BACK : VITE);
});

srv.on("upgrade", (req, socket, head) => {
  const target = net.connect(VITE, "127.0.0.1");
  target.once("connect", () => {
    target.write(
      req.method + " " + req.url + " HTTP/1.1\r\n" +
      Object.entries(req.headers).map(([k, v]) => k + ": " + v).join("\r\n") +
      "\r\n\r\n"
    );
    if (head?.length) target.write(head);
    target.pipe(socket, { end: true });
    socket.pipe(target, { end: true });
  });
  target.on("error", () => socket.destroy());
});

srv.listen(GW, "0.0.0.0", () => {
  console.log(`[wa-gateway] proxy :${GW} → api=:${BACK} client=:${VITE}`);
});
