import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { runWaGatewayMigration } from "./migration.js";
import { initAllSessions } from "./sessions.js";
import authRouter from "./routes/auth.js";
import devicesRouter from "./routes/devices.js";
import messagesRouter from "./routes/messages.js";
import apikeysRouter from "./routes/apikeys.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8000);
const VITE_PORT = Number(process.env.VITE_PORT ?? 0);
const BASE = process.env.BASE_PATH?.replace(/\/$/, "") ?? "/wa-gateway";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// Redirect /wa-gateway → /wa-gateway/
app.get(BASE, (_req, res) => res.redirect(301, `${BASE}/`));

app.use(`${BASE}/api/auth`, authRouter);
app.use(`${BASE}/api/devices`, devicesRouter);
app.use(`${BASE}/api/messages`, messagesRouter);
app.use(`${BASE}/api/apikeys`, apikeysRouter);

// Alias: POST /api/send → /api/messages/send (Fonnte-compatible surface)
app.use(`${BASE}/api/send`, messagesRouter);

app.get(`${BASE}/api/health`, (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

if (VITE_PORT) {
  // Dev mode: proxy all non-API requests to Vite dev server
  app.use((req, res, next) => {
    if (req.path.startsWith(`${BASE}/api`)) return next();
    let attempts = 0;
    function attempt() {
      const opts = {
        hostname: "127.0.0.1",
        port: VITE_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${VITE_PORT}` },
      };
      const proxy = http.request(opts, (r) => {
        res.writeHead(r.statusCode ?? 200, r.headers);
        r.pipe(res, { end: true });
      });
      proxy.on("error", () => {
        if (++attempts < 20) { setTimeout(attempt, 300); }
        else { res.status(502).send("Vite starting..."); }
      });
      req.pipe(proxy, { end: true });
    }
    attempt();
  });
} else {
  const staticDir = path.resolve(__dirname, "../public");
  app.use(BASE, express.static(staticDir));
  app.get(`${BASE}`, (_req, res) => {
    const indexPath = path.join(staticDir, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(200).send("WA Gateway — build client first");
    });
  });
  app.get(`${BASE}/*path`, (_req, res) => {
    const indexPath = path.join(staticDir, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) res.status(200).send("WA Gateway — build client first");
    });
  });
}

async function main() {
  try {
    await runWaGatewayMigration();
  } catch (e: any) {
    console.error("[wa-gateway] Migration error:", e.message);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[wa-gateway] API server on port ${PORT}`);
    console.log(`[wa-gateway] Base path: ${BASE}`);
    console.log(`[wa-gateway] Send API: POST ${BASE}/api/send  OR  POST ${BASE}/api/messages/send`);
  });

  try {
    await initAllSessions();
  } catch (e: any) {
    console.error("[wa-gateway] Session init error:", e.message);
  }
}

main().catch(console.error);
