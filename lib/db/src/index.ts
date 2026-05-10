import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  // DATABASE_URL: Replit-managed Postgres (preferred)
  // SUPABASE_PG_URL / SUPABASE_DATABASE_URL: fallback for legacy compatibility
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_PG_URL,
    process.env.SUPABASE_DATABASE_URL,
  ];

  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) {
      return url;
    }
  }

  throw new Error(
    "No valid PostgreSQL connection string found. Ensure the Replit PostgreSQL database is provisioned (DATABASE_URL).",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
