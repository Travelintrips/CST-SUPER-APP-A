import { defineConfig } from "drizzle-kit";
import path from "path";

function resolveUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_SESSION_URL,
    process.env.SUPABASE_DIRECT_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.SUPABASE_PG_URL,
  ];
  for (const url of candidates) {
    if (url && /^postgres(?:ql)?:\/\//i.test(url)) return url;
  }
  throw new Error(
    "No valid PostgreSQL URL found. Set DATABASE_URL.",
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
