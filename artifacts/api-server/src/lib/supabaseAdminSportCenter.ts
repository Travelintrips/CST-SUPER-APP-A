import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRequire as _cr } from "module";
const _ws = (() => { try { return _cr(import.meta.url)("ws"); } catch { return globalThis.WebSocket; } })();
type WsType = typeof globalThis.WebSocket;

function normalizeSupabaseUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  return `https://${raw}.supabase.co`;
}

const isProduction = !!process.env.REPLIT_DEPLOYMENT;

const url = normalizeSupabaseUrl(
  isProduction
    ? (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "")
    : (process.env.SUPABASE_URL_DEV ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "")
);

const key = isProduction
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
  : (process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!_client) {
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: _ws as unknown as WsType },
    });
  }
  return _client;
}

export function getSportCenterSupabaseClient(): SupabaseClient | null {
  return getClient();
}

const env = isProduction ? "production" : "dev";
console.log(
  `[SportCenter Supabase] env=${env} url=${url ? url.replace(/https:\/\/([^.]+).*/, "https://$1...") : "(not set)"} key=${key ? "set" : "(not set)"}`
);
