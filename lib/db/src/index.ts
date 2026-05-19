import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  // Prefer Supabase: it holds the canonical application data.
  // DATABASE_URL is only used as fallback (e.g. local dev with embedded pg).
  const candidates = [
    process.env.SUPABASE_PG_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
  ];

  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) {
      return url;
    }
  }

  throw new Error(
    "No valid PostgreSQL connection string found. Set SUPABASE_PG_URL, SUPABASE_DATABASE_URL, or DATABASE_URL.",
  );
}

const connectionString = resolveConnectionString();
const isLocalConn = /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocalConn ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[pg pool] Idle client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
