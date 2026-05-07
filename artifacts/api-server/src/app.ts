import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordResponseTime } from "./lib/responseTimeLog";

const app: Express = express();

// Attach X-Response-Time header (milliseconds) to every response and record it
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

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Dynamically pass proxyUrl so clerkMiddleware can validate JWT tokens
// that were issued through the Clerk proxy in production.
app.use((req, res, next) => {
  const host = getClerkProxyHost(req);
  const protocol = (Array.isArray(req.headers["x-forwarded-proto"])
    ? req.headers["x-forwarded-proto"][0]
    : req.headers["x-forwarded-proto"])?.split(",")[0]?.trim() || "https";
  const proxyUrl = host ? `${protocol}://${host}${CLERK_PROXY_PATH}` : undefined;
  clerkMiddleware({ proxyUrl })(req, res, next);
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
