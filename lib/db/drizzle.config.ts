import { defineConfig } from "drizzle-kit";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

function resolveUrl(): string {
  const candidates = [
    isDev ? process.env.SUPABASE_DATABASE_URL_DEV : undefined,
    process.env.SUPABASE_PG_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
  ];
  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) return url;
  }
  throw new Error(
    "No valid PostgreSQL URL found. Set SUPABASE_DATABASE_URL_DEV (dev) or SUPABASE_DATABASE_URL (prod).",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: resolveUrl(),
  },
  tablesFilter: ["!oauth_states"],
});
