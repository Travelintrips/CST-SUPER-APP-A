/**
 * startupValidator.ts
 * Cek ketersediaan runtime dependencies saat server startup.
 * Hasil disimpan di modul-level untuk di-expose via /api/system/runtime-check.
 */

import { logger } from "./logger.js";
import { getCircuitBreakerStatus, pingDbNoCb } from "@workspace/db";

export interface DepCheckResult {
  status: "ok" | "missing" | "error";
  version?: string;
  detail?: string;
}

export interface RuntimeCheckState {
  checkedAt: string;
  status: "ok" | "degraded";
  dependencies: Record<string, DepCheckResult>;
  missing: string[];
}

let _state: RuntimeCheckState | null = null;

async function checkImport(pkg: string): Promise<DepCheckResult> {
  try {
    const m = await import(pkg);
    const version: string | undefined =
      m?.version ??
      m?.default?.version ??
      (m?.VERSION as string | undefined) ??
      undefined;
    return { status: "ok", version };
  } catch (err: any) {
    if (err?.code === "MODULE_NOT_FOUND") {
      return { status: "missing", detail: `Module '${pkg}' tidak ditemukan di node_modules` };
    }
    return { status: "error", detail: String(err?.message ?? err) };
  }
}

async function checkGoogleapis(): Promise<DepCheckResult> {
  try {
    const g = await import("googleapis");
    const version: string | undefined =
      g?.version ?? (g as any)?.default?.version ?? undefined;
    if (!g?.google && !g?.default?.google && !g?.Auth) {
      return { status: "error", detail: "googleapis loaded tapi export 'google' tidak ditemukan" };
    }
    return { status: "ok", version };
  } catch (err: any) {
    if (err?.code === "MODULE_NOT_FOUND") {
      return { status: "missing", detail: "Package 'googleapis' tidak ditemukan" };
    }
    return { status: "error", detail: String(err?.message ?? err) };
  }
}

async function checkDrizzle(): Promise<DepCheckResult> {
  try {
    const m = await import("drizzle-orm");
    const hasSql = typeof m?.sql === "function";
    if (!hasSql) return { status: "error", detail: "drizzle-orm loaded tapi export 'sql' tidak tersedia" };
    return { status: "ok" };
  } catch (err: any) {
    if (err?.code === "MODULE_NOT_FOUND") {
      return { status: "missing", detail: "Package 'drizzle-orm' tidak ditemukan" };
    }
    return { status: "error", detail: String(err?.message ?? err) };
  }
}

async function checkPg(): Promise<DepCheckResult> {
  // Gunakan pingDbNoCb() — raw pool sementara yang TIDAK melewati CB guard.
  // Dengan ini, hasil ping tidak akan membuka circuit breaker lokal,
  // sehingga startup validator tidak ikut-ikutan memicu ECB saat pgBouncer throttle.
  const cbStatus = getCircuitBreakerStatus();
  if (cbStatus.open) {
    const remaining = cbStatus.remainingCooldownSeconds;
    return {
      status: "error",
      detail: `Circuit breaker open — pgBouncer sedang throttle (cooldown ${remaining}s lagi). Queries di-hold sampai CB expire.`,
    };
  }

  const result = await pingDbNoCb();
  if (result.ok) {
    return { status: "ok", detail: `DB ping OK (${result.latencyMs}ms)` };
  }
  return { status: "error", detail: result.error ?? "Ping gagal (tidak ada detail)" };
}

async function checkOpenai(): Promise<DepCheckResult> {
  try {
    const m = await import("openai");
    const hasClass = !!(m?.OpenAI ?? m?.default?.OpenAI ?? m?.default);
    if (!hasClass) return { status: "error", detail: "openai loaded tapi class OpenAI tidak ditemukan" };
    return { status: "ok" };
  } catch (err: any) {
    if (err?.code === "MODULE_NOT_FOUND") {
      return { status: "missing", detail: "Package 'openai' tidak ditemukan" };
    }
    return { status: "error", detail: String(err?.message ?? err) };
  }
}

async function checkNodemailer(): Promise<DepCheckResult> {
  try {
    const m = await import("nodemailer");
    const hasCreate = typeof (m?.createTransport ?? m?.default?.createTransport) === "function";
    if (!hasCreate) return { status: "error", detail: "nodemailer loaded tapi createTransport tidak ditemukan" };
    return { status: "ok" };
  } catch (err: any) {
    if (err?.code === "MODULE_NOT_FOUND") {
      return { status: "missing", detail: "Package 'nodemailer' tidak ditemukan" };
    }
    return { status: "error", detail: String(err?.message ?? err) };
  }
}

const REQUIRED_SECRETS: Array<{ name: string; minLen?: number }> = [
  { name: "SESSION_SECRET", minLen: 32 },
  { name: "PORTAL_ADMIN_KEY", minLen: 16 },
  { name: "CASHIER_TOKEN_SECRET", minLen: 16 },
];

function checkRequiredSecrets(): { missing: string[]; weak: string[] } {
  const missing: string[] = [];
  const weak: string[] = [];
  for (const { name, minLen = 1 } of REQUIRED_SECRETS) {
    const val = process.env[name] ?? "";
    if (!val) {
      missing.push(name);
    } else if (val.length < minLen) {
      weak.push(`${name} (panjang ${val.length} < ${minLen})`);
    } else if (
      val === "admin123" ||
      val === "secret" ||
      val === "changeme" ||
      val === "password" ||
      val === "1234" ||
      val === "test"
    ) {
      weak.push(`${name} (nilai default tidak aman)`);
    }
  }
  return { missing, weak };
}

export async function runStartupValidation(): Promise<RuntimeCheckState> {
  logger.info("[startupValidator] Memeriksa runtime dependencies...");

  const { missing: missingSecrets, weak: weakSecrets } = checkRequiredSecrets();
  if (missingSecrets.length > 0) {
    logger.error({ missingSecrets }, "[startupValidator] SECRET WAJIB TIDAK DIKONFIGURASI — set di Replit Secrets");
    throw new Error(
      `Secret wajib tidak dikonfigurasi: ${missingSecrets.join(", ")}. ` +
      "Set di Replit Secrets sebelum menjalankan server."
    );
  }
  if (weakSecrets.length > 0) {
    logger.error({ weakSecrets }, "[startupValidator] SECRET LEMAH TERDETEKSI — ganti sekarang");
    throw new Error(
      `Secret tidak aman: ${weakSecrets.join(", ")}. ` +
      "Ganti dengan nilai acak yang kuat di Replit Secrets."
    );
  }

  const [googleapis, openai, drizzle, pg, nodemailer] = await Promise.allSettled([
    checkGoogleapis(),
    checkOpenai(),
    checkDrizzle(),
    checkPg(),
    checkNodemailer(),
  ]);

  const deps: Record<string, DepCheckResult> = {
    googleapis:  googleapis.status  === "fulfilled" ? googleapis.value  : { status: "error", detail: String((googleapis as any).reason) },
    openai:      openai.status      === "fulfilled" ? openai.value      : { status: "error", detail: String((openai as any).reason) },
    "drizzle-orm": drizzle.status   === "fulfilled" ? drizzle.value     : { status: "error", detail: String((drizzle as any).reason) },
    pg:          pg.status          === "fulfilled" ? pg.value          : { status: "error", detail: String((pg as any).reason) },
    nodemailer:  nodemailer.status  === "fulfilled" ? nodemailer.value  : { status: "error", detail: String((nodemailer as any).reason) },
  };

  const missing = Object.entries(deps)
    .filter(([, v]) => v.status === "missing")
    .map(([k]) => k);

  const hasError = Object.values(deps).some((v) => v.status === "missing" || v.status === "error");

  const state: RuntimeCheckState = {
    checkedAt: new Date().toISOString(),
    status: hasError ? "degraded" : "ok",
    dependencies: deps,
    missing,
  };

  _state = state;

  if (missing.length > 0) {
    logger.error({ missing }, "[startupValidator] DEPENDENCY HILANG — install dengan pnpm add <package>");
  } else if (hasError) {
    const errors = Object.entries(deps).filter(([, v]) => v.status === "error").map(([k]) => k);
    logger.warn({ errors }, "[startupValidator] Beberapa dependency error saat load");
  } else {
    logger.info("[startupValidator] Semua runtime dependencies OK");
  }

  return state;
}

export function getRuntimeCheckState(): RuntimeCheckState | null {
  return _state;
}
