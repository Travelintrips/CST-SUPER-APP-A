import express, { type Express } from "express";
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

// Redirect bizportal subdomain root to /bizportal/
app.use((req, res, next) => {
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const hostname = host.split(":")[0];
  if (hostname === "bizportal.cstlogistic.co.id" && req.path === "/") {
    return res.redirect(301, "/bizportal/");
  }
  next();
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
