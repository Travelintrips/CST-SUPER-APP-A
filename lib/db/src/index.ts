import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  const isProd = process.env.NODE_ENV === "production";

  const candidates = isProd
    ? [
        process.env.SUPABASE_DATABASE_URL,
        process.env.SUPABASE_PG_URL,
        process.env.DATABASE_URL,
      ]
    : [
        process.env.SUPABASE_DATABASE_URL_DEV,
        process.env.SUPABASE_DATABASE_URL,
        process.env.SUPABASE_PG_URL,
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
    "No valid PostgreSQL connection string found. Set SUPABASE_DATABASE_URL_DEV (dev) or SUPABASE_PG_URL (prod).",
  );
}

const connectionString = resolveConnectionString();
const isLocalConn = /localhost|127\.0\.0\.1|helium/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocalConn ? false : { rejectUnauthorized: false },
  max: 3,
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
});

pool.on("error", (err) => {
  console.error("[pg pool] Idle client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
