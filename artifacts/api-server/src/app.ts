import path from "path";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import companiesRouter from "./routes/companies";
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
      req(req: IncomingMessage & { id?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
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

// Auth routes (login/callback/logout/mobile-auth) — mounted under /api
app.use("/api", authRouter);

// ─── Customer Portal Static Serving ──────────────────────────────────────────
// Customer portal is built with base="/" so assets are at /assets/...
// Serves at root "/" so confirm links (https://domain/confirm/:token) work.
// Must come BEFORE /api routes for static assets, but SPA fallback is AFTER.

const CUSTOMER_PORTAL_DIST = path.resolve(
  process.cwd(),
  "../customer-portal/dist/public",
);

if (fs.existsSync(CUSTOMER_PORTAL_DIST)) {
  // Serve static files (JS/CSS/images) — these paths never conflict with /api/*
  app.use(express.static(CUSTOMER_PORTAL_DIST, { index: false }));
}

// ─── BizPortal Static Serving ────────────────────────────────────────────────
// BizPortal is built with base="/bizportal/" so all asset hrefs are /bizportal/...
// The API server handles /bizportal/* so that:
//   1. cst-super-app.replit.app/bizportal/ works (normal access)
//   2. bizportal.cstlogistic.co.id/bizportal/ works (custom domain, old cached redirect)
//   3. bizportal.cstlogistic.co.id/ works (custom domain root — served below)

const BIZPORTAL_DIST = path.resolve(
  process.cwd(),
  "../bizportal/dist/public",
);

// Serve static assets at /bizportal/* (strips /bizportal prefix internally)
if (fs.existsSync(BIZPORTAL_DIST)) {
  app.use(
    "/bizportal",
    express.static(BIZPORTAL_DIST, { index: "index.html" }),
  );

  // SPA fallback: any /bizportal/* path that isn't a file → index.html
  app.use("/bizportal/{*path}", (_req: Request, res: Response) => {
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

app.use("/api/companies", companiesRouter);
app.use("/api", router);

// ─── Customer Portal SPA Fallback ────────────────────────────────────────────
// For any non-API, non-BizPortal path (e.g. /confirm/:token, /, /services, etc.)
// serve the customer portal index.html so client-side routing works.
if (fs.existsSync(CUSTOMER_PORTAL_DIST)) {
  const PORTAL_SKIP = ["/api/", "/bizportal", "/login", "/logout", "/callback", "/auth", "/mobile-auth"];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (PORTAL_SKIP.some((p) => req.path === p || req.path.startsWith(p + "/") || req.path.startsWith(p))) {
      return next();
    }
    const indexPath = path.join(CUSTOMER_PORTAL_DIST, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

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
