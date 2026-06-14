import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getRuntimeCheckState } from "../lib/startupValidator.js";

const router: IRouter = Router();
const startedAt = Date.now();

type ServiceStatus = "ok" | "error" | "unconfigured" | "degraded";

interface ExternalCheckResult {
  status: ServiceStatus;
  latencyMs: number | null;
  detail?: string;
}

const cache = new Map<string, { result: ExternalCheckResult; expiresAt: number }>();

async function cachedCheck(
  key: string,
  fn: () => Promise<ExternalCheckResult>,
  ttlMs = 60_000,
): Promise<ExternalCheckResult> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.result;
  const result = await fn();
  cache.set(key, { result, expiresAt: Date.now() + ttlMs });
  return result;
}

async function checkDb(): Promise<ExternalCheckResult> {
  try {
    const t0 = Date.now();
    await pool.query("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: "error", latencyMs: null, detail: String(err) };
  }
}

async function checkFonnte(): Promise<ExternalCheckResult> {
  const token = process.env.FONNTE_TOKEN?.trim();
  if (!token) return { status: "unconfigured", latencyMs: null };
  try {
    const t0 = Date.now();
    const res = await fetch("https://api.fonnte.com/device", {
      method: "POST",
      headers: { Authorization: token },
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { status: "error", latencyMs, detail: `HTTP ${res.status}` };
    const body = await res.json() as Record<string, unknown>;
    if (body.status === false || body.status === "false") {
      return { status: "error", latencyMs, detail: String(body.reason ?? body.message ?? "status:false") };
    }
    return { status: "ok", latencyMs };
  } catch (err) {
    return { status: "error", latencyMs: null, detail: String(err) };
  }
}

async function checkResend(): Promise<ExternalCheckResult> {
  const apiKey = process.env.SMTP_PASS?.trim();
  if (!apiKey) return { status: "unconfigured", latencyMs: null };
  try {
    const t0 = Date.now();
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - t0;
    if (res.status === 401) return { status: "error", latencyMs, detail: "Invalid API key" };
    if (!res.ok) return { status: "error", latencyMs, detail: `HTTP ${res.status}` };
    return { status: "ok", latencyMs };
  } catch (err) {
    return { status: "error", latencyMs: null, detail: String(err) };
  }
}

router.get("/healthz", async (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const version = process.env.npm_package_version ?? "0.0.0";

  const [db, whatsapp, smtp] = await Promise.all([
    checkDb(),
    cachedCheck("fonnte", checkFonnte),
    cachedCheck("resend", checkResend),
  ]);

  const runtimeState = getRuntimeCheckState();
  const hasMissingDeps = (runtimeState?.missing.length ?? 0) > 0;

  const criticalFailing = db.status === "error";
  const anyExternalError = whatsapp.status === "error" || smtp.status === "error";

  const overallStatus = criticalFailing ? "error"
    : hasMissingDeps ? "degraded"
    : anyExternalError ? "degraded"
    : "ok";

  // Selalu return 200 agar deployment platform tidak restart server.
  // DB down bukan alasan untuk membunuh proses — session memory masih bisa melayani user.
  res.status(200).json({
    status: overallStatus,
    db: db.status,
    dbLatencyMs: db.latencyMs,
    uptimeSeconds,
    version,
    services: {
      db: db.status,
      whatsapp: whatsapp.status,
      whatsappLatencyMs: whatsapp.latencyMs,
      smtp: smtp.status,
      smtpLatencyMs: smtp.latencyMs,
    },
    dependencies: runtimeState
      ? {
          status: runtimeState.status,
          missing: runtimeState.missing,
          checkedAt: runtimeState.checkedAt,
        }
      : { status: "not_checked", missing: [] },
  });
});

export default router;
