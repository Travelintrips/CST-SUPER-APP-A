import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  // Prefer Supabase URLs over the Replit-managed DATABASE_URL (which points to
  // the local helium PostgreSQL instance that does not contain the app schema).
  const candidates = [
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
    "No valid PostgreSQL connection string found. Set SUPABASE_PG_URL or DATABASE_URL.",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

export * from "./schema";
