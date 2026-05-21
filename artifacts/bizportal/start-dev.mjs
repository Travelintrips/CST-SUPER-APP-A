import http from "http";
import net from "net";
import { spawn } from "child_process";

const PORT = Number(process.env.PORT || 18442);
const VITE_PORT = PORT + 1;

process.env.PORT = String(VITE_PORT);

function waitForVite(port, maxMs = 60000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const s = net.createConnection({ port, host: "localhost" });
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        if (Date.now() > deadline) return reject(new Error("Vite did not start in time"));
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

function createProxy(port) {
  const srv = http.createServer((req, res) => {
    const opts = {
      hostname: "localhost",
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };
    const proxy = http.request(opts, (pr) => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res, { end: true });
    });
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("BizPortal starting…");
    });
    req.pipe(proxy, { end: true });
  });

  srv.on("upgrade", (req, socket, head) => {
    const client = net.createConnection({ port, host: "localhost" }, () => {
      client.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        client.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
      }
      client.write("\r\n");
      if (head && head.length) client.write(head);
      socket.pipe(client);
      client.pipe(socket);
    });
    client.on("error", () => socket.destroy());
    socket.on("error", () => client.destroy());
  });

  return new Promise((resolve, reject) => {
    srv.listen(PORT, "0.0.0.0", () => {
      console.log(`[start-dev] Proxy listening on :${PORT} → Vite :${VITE_PORT}`);
      resolve(srv);
    });
    srv.on("error", reject);
  });
}

async function main() {
  const vite = spawn(
    "npx",
    ["vite", "--config", "vite.config.ts", "--host", "0.0.0.0"],
    {
      env: { ...process.env, PORT: String(VITE_PORT) },
      stdio: "inherit",
      cwd: import.meta.dirname,
      shell: false,
    }
  );

  vite.on("exit", (code) => {
    console.log(`[start-dev] Vite exited (${code})`);
    process.exit(code ?? 1);
  });

  await waitForVite(VITE_PORT);
  await createProxy(VITE_PORT);
}

main().catch((e) => { console.error(e); process.exit(1); });
