import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  const isProd = process.env.NODE_ENV === "production";

  const candidates = isProd
    ? [
        process.env.SUPABASE_DATABASE_URL,
        process.env.DATABASE_URL,
      ]
    : [
        process.env.SUPABASE_DATABASE_URL_DEV,
        process.env.SUPABASE_DATABASE_URL,
        process.env.DATABASE_URL,
      ];

  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) {
      const label = isProd ? "production" : "development";
      const masked = url.replace(/\/\/[^@]+@/, "//***@").split("?")[0];
      console.log(`[db] env=${label} → ${masked}`);
      return url;
    }
  }

  throw new Error(
    "No valid PostgreSQL connection string found. Set SUPABASE_DATABASE_URL.",
  );
}

const connectionString = resolveConnectionString();
const isLocalConn = /localhost|127\.0\.0\.1|helium/.test(connectionString);
const isProdEnv = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;

// Pool config — configurable via env vars.
// Dev default: max=3 (fewer connections to reduce pgBouncer pressure)
// Prod default: max=5
const PG_POOL_MAX = process.env.PG_POOL_MAX
  ? Math.max(1, parseInt(process.env.PG_POOL_MAX))
  : isProdEnv ? 5 : 3;
const PG_IDLE_TIMEOUT_MS = process.env.PG_IDLE_TIMEOUT_MS
  ? parseInt(process.env.PG_IDLE_TIMEOUT_MS)
  : 30_000;
const PG_CONNECTION_TIMEOUT_MS = process.env.PG_CONNECTION_TIMEOUT_MS
  ? parseInt(process.env.PG_CONNECTION_TIMEOUT_MS)
  : 8_000;

console.log(
  `[db] pool config — max=${PG_POOL_MAX}, connTimeout=${PG_CONNECTION_TIMEOUT_MS}ms, idleTimeout=${PG_IDLE_TIMEOUT_MS}ms`
);

export const pool = new Pool({
  connectionString,
  ssl: isLocalConn ? false : { rejectUnauthorized: false },
  max: PG_POOL_MAX,
  min: 0,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: false,
});

// ── Pool-level ECIRCUITBREAKER guard ────────────────────────────────────────
// Ketika pgBouncer memblokir koneksi karena terlalu banyak auth failure,
// setiap retry dari background workers justru memperpanjang block.
// Guard ini: ketika ECIRCUITBREAKER terdeteksi, semua koneksi baru ditolak
// secara lokal selama 5 menit agar pgBouncer punya waktu reset sendiri.

const ECB_PAUSE_MS = 5 * 60 * 1000;
let ecbBlockedUntil = 0;
let ecbLastTrigger: { source: string; message: string; openedAt: string } | null = null;

function isEcbError(err: unknown): boolean {
  const msg = (err as any)?.message ?? "";
  const cause = (err as any)?.cause?.message ?? "";
  return (
    msg.includes("ECIRCUITBREAKER") ||
    cause.includes("ECIRCUITBREAKER")
  );
}

function setEcbBlock(source: string, originalErr?: unknown) {
  const now = Date.now();
  if (now >= ecbBlockedUntil) {
    ecbBlockedUntil = now + ECB_PAUSE_MS;
    const resume = new Date(ecbBlockedUntil).toISOString();
    const openedAt = new Date(now).toISOString();
    // Ambil pesan asli dari pgBouncer/pg, bukan dari error lokal kita
    const rawMsg =
      (originalErr as any)?.cause?.message ||
      (originalErr as any)?.message ||
      "(tidak ada detail)";
    ecbLastTrigger = { source, message: rawMsg, openedAt };
    console.warn(
      `[db pool] ECIRCUITBREAKER dari '${source}' — blokir koneksi baru sampai ${resume}`,
      { rawMsg },
    );
  }
}

function makeEcbError(): Error {
  const remaining = Math.ceil((ecbBlockedUntil - Date.now()) / 1000);
  return Object.assign(
    new Error(
      `(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked (local cooldown ${remaining}s)`,
    ),
    { code: "ECIRCUITBREAKER_LOCAL" },
  );
}

// Patch pool.connect — handle BOTH callback mode (used by pool.query internally)
// AND promise mode (used by external callers).
const _origConnect = pool.connect.bind(pool);
(pool as any).connect = function connect(
  this: typeof pool,
  ...args: unknown[]
): unknown {
  // If locally blocked, reject immediately without touching pgBouncer
  if (Date.now() < ecbBlockedUntil) {
    const ecbErr = makeEcbError();
    // Check for callback (pg-pool callback convention: last arg is function)
    const lastArg = args[args.length - 1];
    if (typeof lastArg === "function") {
      const cb = lastArg as (err: Error, client?: unknown, done?: unknown) => void;
      process.nextTick(() => cb(ecbErr));
      return undefined;
    }
    return Promise.reject(ecbErr);
  }

  // Has callback → wrap the callback to detect ECB errors
  const lastArg = args[args.length - 1];
  if (typeof lastArg === "function") {
    const origCb = lastArg as (err: Error | null, client?: unknown, done?: unknown) => void;
    const newArgs = [...args.slice(0, -1), function wrappedCb(
      err: Error | null,
      client: unknown,
      done: unknown,
    ) {
      if (err && isEcbError(err)) setEcbBlock("pool.connect-cb", err);
      return origCb(err, client, done);
    }];
    return _origConnect.apply(pool, newArgs as any);
  }

  // Promise mode
  const result = _origConnect.apply(pool, args as any) as Promise<unknown>;
  if (result && typeof result.catch === "function") {
    return result.catch((err: unknown) => {
      if (isEcbError(err)) setEcbBlock("pool.connect-promise", err);
      throw err;
    });
  }
  return result;
};

pool.on("error", (err) => {
  if (isEcbError(err)) {
    setEcbBlock("pool idle error", err);
  } else {
    console.error("[pg pool] Idle client error (non-fatal):", err.message);
  }
});

// ── Startup probe (TOP-LEVEL AWAIT) ──────────────────────────────────────────
// Probe pgBouncer dengan raw pool (tanpa CB patch) SEBELUM modul ini resolve export-nya.
// Top-level await menyebabkan semua importer (@workspace/db) menunggu sampai probe selesai,
// sehingga jika pgBouncer sudah throttle, CB lokal di-set SEBELUM route-level top-level
// DB calls (approvalWorkflow, cashAdvances, paymentProof, dll.) sempat menggunakan patched pool.
// Probe timeout: 4 detik — cepat karena pgBouncer biasanya langsung reject jika throttled.
await (async function startupProbe() {
  try {
    const tempPool = new Pool({
      connectionString,
      ssl: isLocalConn ? false : { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 4_000,
    });
    try {
      await tempPool.query("SELECT 1");
      console.log("[db startup probe] pgBouncer OK — DB siap, tidak ada pre-existing throttle");
    } catch (err: unknown) {
      const msg = String((err as any)?.message ?? "");
      const isAuthFailure =
        msg.includes("ECIRCUITBREAKER") ||
        msg.includes("too many authentication") ||
        msg.includes("password authentication failed") ||
        msg.includes("authentication failed");
      if (isAuthFailure) {
        // Auth failure → pgBouncer throttle terdeteksi sebelum route-level code jalan.
        // Set CB proaktif agar semua route-level top-level DB calls ditolak lokal
        // tanpa memperpanjang throttle di sisi pgBouncer.
        // Admin dapat reset via POST /api/system/reset-circuit-breaker setelah DB pulih.
        setEcbBlock("startup-probe", err);
        console.warn(
          "[db startup probe] Auth failure saat startup — CB lokal diset proaktif (" +
          msg.slice(0, 80) + "). " +
          "Top-level DB calls ditolak lokal selama " + (ECB_PAUSE_MS / 60_000).toFixed(0) + " menit."
        );
      } else {
        // Timeout atau error non-auth — bukan throttle pgBouncer, biarkan pool mencoba sendiri
        console.warn("[db startup probe] DB tidak tersedia saat startup (non-auth):", msg.slice(0, 120));
      }
    } finally {
      tempPool.end().catch(() => {});
    }
  } catch {
    // Jangan crash server jika probe gagal
  }
})();

export const db = drizzle(pool, { schema });

export * from "./schema";

/** Baca status circuit breaker saat ini (untuk diagnostik, tidak memerlukan koneksi DB). */
export function getCircuitBreakerStatus(): {
  open: boolean;
  openedAt: string | null;
  remainingCooldownSeconds: number;
  lastTrigger: { source: string; message: string; openedAt: string } | null;
} {
  const now = Date.now();
  const open = now < ecbBlockedUntil;
  return {
    open,
    openedAt: open ? new Date(ecbBlockedUntil - ECB_PAUSE_MS).toISOString() : null,
    remainingCooldownSeconds: open ? Math.ceil((ecbBlockedUntil - now) / 1000) : 0,
    lastTrigger: ecbLastTrigger,
  };
}

/**
 * Reset circuit breaker secara manual (admin only).
 * Hanya berguna setelah root cause sudah diperbaiki (password/credentials fixed).
 * Jangan reset jika credentials masih salah — CB akan terbuka lagi segera.
 */
export function resetCircuitBreaker(): void {
  ecbBlockedUntil = 0;
  ecbLastTrigger = null;
  console.warn("[db pool] Circuit breaker di-RESET secara manual oleh admin.");
}

/** Pool stats snapshot — tidak memerlukan koneksi baru. */
export function getPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Ping DB secara langsung tanpa CB guard — hanya untuk health check startup.
 * Menggunakan koneksi sementara yang TIDAK melewati patch pool.connect,
 * sehingga hasil ping tidak akan membuka atau menutup circuit breaker lokal.
 * Timeout: 5 detik.
 */
export async function pingDbNoCb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const { Pool: RawPool } = await import("pg");
  const connectionString = resolveConnectionString();
  const isLocal = /localhost|127\.0\.0\.1|helium/.test(connectionString);
  const tempPool = new RawPool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const t0 = Date.now();
    await tempPool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    return { ok: false, error: String((err as any)?.message ?? err).slice(0, 200) };
  } finally {
    tempPool.end().catch(() => {});
  }
}

/** Masked DB connection info untuk diagnostik. */
export function getActiveDbInfo(): {
  source: string;
  host: string;
  mode: string;
  pooler: boolean;
} {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
  const mode = isProd ? "production" : "development";

  // Resolve mana yang aktif (sama dengan resolveConnectionString, tapi read-only)
  const candidates = isProd
    ? [
        { key: "SUPABASE_DATABASE_URL", val: process.env.SUPABASE_DATABASE_URL },
        { key: "DATABASE_URL", val: process.env.DATABASE_URL },
      ]
    : [
        { key: "SUPABASE_DATABASE_URL_DEV", val: process.env.SUPABASE_DATABASE_URL_DEV },
        { key: "SUPABASE_DATABASE_URL", val: process.env.SUPABASE_DATABASE_URL },
        { key: "DATABASE_URL", val: process.env.DATABASE_URL },
      ];

  for (const c of candidates) {
    if (c.val && /^postgres(?:ql)?:\/\//i.test(c.val)) {
      const host = (c.val.match(/@([^:/]+)/) ?? [])[1] ?? "unknown";
      return {
        source: c.key,
        host,
        mode,
        pooler: host.includes("pooler") || host.includes("pgbouncer") || c.val.includes(":6543"),
      };
    }
  }

  return { source: "(none)", host: "unknown", mode, pooler: false };
}
