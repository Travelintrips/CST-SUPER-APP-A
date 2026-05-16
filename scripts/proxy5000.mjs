import http from "http";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

// Kill anything on port 5000 and 8080 first
try { execSync("fuser -k 5000/tcp", { stdio: "ignore" }); } catch {}
try { execSync("fuser -k 8080/tcp", { stdio: "ignore" }); } catch {}

// Spawn API server if not already running
const apiDist = resolve("artifacts/api-server/dist/index.mjs");
if (existsSync(apiDist)) {
  const api = spawn("node", ["--enable-source-maps", apiDist], {
    env: { ...process.env, NODE_ENV: "development", PORT: "8080" },
    stdio: "inherit",
  });
  api.on("exit", (code) => {
    console.log(`[proxy] API server exited (${code}), restarting in 3s...`);
    setTimeout(() => {
      const api2 = spawn("node", ["--enable-source-maps", apiDist], {
        env: { ...process.env, NODE_ENV: "development", PORT: "8080" },
        stdio: "inherit",
      });
      api2.on("exit", (c) => console.log(`[proxy] API server exited again (${c})`));
    }, 3000);
  });
  console.log("[proxy] API server spawned on port 8080");
} else {
  console.warn("[proxy] API dist not found, skipping API server spawn");
}

// Route rules: requests matching pathPrefix go to the given upstream port.
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
