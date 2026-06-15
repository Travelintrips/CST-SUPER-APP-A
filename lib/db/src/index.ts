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

export const pool = new Pool({
  connectionString,
  ssl: isLocalConn ? false : { rejectUnauthorized: false },
  max: 2,
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
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
