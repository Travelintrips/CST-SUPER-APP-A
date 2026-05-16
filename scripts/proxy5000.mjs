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
