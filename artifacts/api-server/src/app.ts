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

// ─── BizPortal Static Serving ────────────────────────────────────────────────
// BizPortal is built with base="/bizportal/" so all asset hrefs are /bizportal/...
// The API server handles /bizportal/* so that:
//   1. cst-super-app.replit.app/bizportal/ works (normal access)
//   2. bizportal.cstlogistic.co.id/bizportal/ works (custom domain, old cached redirect)
//   3. bizportal.cstlogistic.co.id/ works (custom domain root — served below)

const BIZPORTAL_DIST = path.resolve(
  process.cwd(),
  "artifacts/bizportal/dist/public",
);

// Serve static assets at /bizportal/* (strips /bizportal prefix internally)
if (fs.existsSync(BIZPORTAL_DIST)) {
  app.use(
    "/bizportal",
    express.static(BIZPORTAL_DIST, { index: "index.html" }),
  );

  // SPA fallback: any /bizportal/* path that isn't a file → index.html
  app.use("/bizportal/*", (_req: Request, res: Response) => {
    res.sendFile(path.join(BIZPORTAL_DIST, "index.html"));
  });
}

// ─── Custom domain: serve BizPortal at root "/" ───────────────────────────────
// When accessed via bizportal.cstlogistic.co.id, requests for "/" should show
// BizPortal. The HTML will load assets from /bizportal/assets/... which are
// handled by the express.static above.
app.use((req: Request, res: Response, next: NextFunction) => {
  const host =
    (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const hostname = host.split(":")[0];

  if (hostname !== "bizportal.cstlogistic.co.id") return next();

  // Skip API / auth routes
  const skip = ["/api/", "/login", "/logout", "/callback", "/auth", "/mobile-auth", "/bizportal"];
  if (skip.some((p) => req.path === p || req.path.startsWith(p + "/") || req.path.startsWith(p))) {
    return next();
  }

  const indexPath = path.join(BIZPORTAL_DIST, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

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
