import path from "path";
import fs from "fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";
import { recordResponseTime } from "./lib/responseTimeLog";

const app: Express = express();

app.use((req, res, next) => {
  const startNs = process.hrtime.bigint();
  const originalEnd = res.end.bind(res) as typeof res.end;
  res.end = ((...args: Parameters<typeof res.end>) => {
    if (!res.headersSent) {
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      res.setHeader("X-Response-Time", `${elapsedMs.toFixed(2)}ms`);
      recordResponseTime(req.path, elapsedMs);
    }
    return originalEnd(...args);
  }) as typeof res.end;
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

// Replit Auth middleware — populates req.user and req.isAuthenticated()
app.use(authMiddleware);

// Auth routes (login/callback/logout/mobile-auth)
app.use(authRouter);

// Serve BizPortal static files for custom domain bizportal.cstlogistic.co.id.
// When the custom domain is active, all requests arrive at the API server.
// BizPortal is built with base="/bizportal/", so HTML references /bizportal/assets/...
// We strip the /bizportal prefix and serve from the dist directory.
const BIZPORTAL_DIST = path.resolve(
  process.cwd(),
  "artifacts/bizportal/dist/public",
);

function serveBizportalStatic(req: Request, res: Response, next: NextFunction) {
  const host =
    (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const hostname = host.split(":")[0];

  if (hostname !== "bizportal.cstlogistic.co.id") return next();

  // Let API / auth routes pass through
  const skipPrefixes = ["/api/", "/login", "/logout", "/callback", "/auth", "/mobile-auth"];
  if (skipPrefixes.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
    return next();
  }

  // BizPortal HTML references assets as /bizportal/assets/... so strip that prefix
  let filePath = req.path;
  if (filePath.startsWith("/bizportal")) {
    filePath = filePath.slice("/bizportal".length) || "/";
  }
  if (!filePath || filePath === "/") filePath = "/index.html";

  const fullPath = path.join(BIZPORTAL_DIST, filePath);

  // Serve the file if it exists, otherwise SPA fallback to index.html
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    res.sendFile(fullPath);
  } else {
    const indexPath = path.join(BIZPORTAL_DIST, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  }
}

app.use(serveBizportalStatic);

app.use("/api", router);

// Global error handler — logs unhandled errors and returns JSON
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(
    {
      err: { message: err.message, stack: err.stack, name: err.name },
      method: req.method,
      url: req.url,
    },
    "Unhandled request error",
  );
  if (res.headersSent) return;
  const isProd = process.env["NODE_ENV"] === "production";
  res.status(500).json({
    message: "Internal Server Error",
    ...(isProd ? {} : { error: err.message }),
  });
});

export default app;
