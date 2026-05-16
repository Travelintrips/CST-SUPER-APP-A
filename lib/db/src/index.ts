import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isDev = process.env.NODE_ENV !== "production";

function resolveConnectionString(): string {
  // In development, prefer the _DEV variants so the dev database is used
  // instead of production. Falls back to shared/production vars if not set.
  const candidates = [
    isDev ? process.env.SUPABASE_DATABASE_URL_DEV : undefined,
    process.env.SUPABASE_PG_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
  ];

  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) {
      // Switch from pgBouncer transaction pooler (port 6543) to session pooler
      // (port 5432) so that search_path and other session settings are
      // preserved across queries.
      return url.replace(/:6543\//, ":5432/");
    }
  }

  throw new Error(
    "No valid PostgreSQL connection string found. Set SUPABASE_DATABASE_URL_DEV (dev) or SUPABASE_DATABASE_URL (prod).",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Wajib: tangkap error dari idle pool client agar tidak menjadi uncaught exception
// yang menyebabkan process crash di Node.js v15+. Supabase dapat memutus koneksi
// idle setelah ~45 detik, yang men-trigger error event ini.
pool.on("error", (err) => {
  console.error("[pg pool] Idle client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
