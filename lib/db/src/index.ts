import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function resolveConnectionString(): string {
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;

  // SUPABASE_DATABASE_URL must be a valid PostgreSQL connection string (starts with postgres:// or postgresql://)
  if (supabaseUrl && /^postgres(?:ql)?:\/\//i.test(supabaseUrl)) {
    return supabaseUrl;
  }

  if (defaultUrl) {
    return defaultUrl;
  }

  throw new Error(
    "No valid database connection string found. Set SUPABASE_DATABASE_URL (postgresql://...) or DATABASE_URL.",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
