import { createClient, SupabaseClient } from "@supabase/supabase-js";

const isDev = process.env.NODE_ENV !== "production";

function normalizeSupabaseUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  return `https://${raw}.supabase.co`;
}

// In development, prefer _DEV credentials; fall back to shared/prod if not set.
const url = normalizeSupabaseUrl(
  (isDev ? process.env.SUPABASE_URL_DEV : undefined) ??
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  ""
);
const key =
  (isDev ? process.env.SUPABASE_SERVICE_ROLE_KEY_DEV : undefined) ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!_client) {
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    if (!client) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function verifySupabaseToken(token: string) {
  const client = getClient();
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user || !user.email) return null;
  return user;
}
