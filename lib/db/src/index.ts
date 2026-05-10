import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  // SUPABASE_PG_URL: plain env var with valid postgresql:// string (preferred)
  // SUPABASE_DATABASE_URL: secret — only used if it's a valid pg string
  // DATABASE_URL: Replit-managed Postgres (fallback)
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
    "No valid PostgreSQL connection string found. Set SUPABASE_PG_URL (postgresql://...) or DATABASE_URL.",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
