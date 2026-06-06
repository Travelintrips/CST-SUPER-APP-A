import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Only use dev credentials when BOTH URL and anon key are available for dev.
// Mixing dev URL with prod anon key causes auth failures (different JWT secrets).
const isDev = import.meta.env.DEV;
const devUrl = isDev ? (import.meta.env.VITE_SUPABASE_URL_DEV as string | undefined || undefined) : undefined;
const devAnonKey = isDev ? (import.meta.env.VITE_SUPABASE_ANON_KEY_DEV as string | undefined || undefined) : undefined;
const useDevCredentials = !!devUrl && !!devAnonKey;

const rawUrl = useDevCredentials
  ? devUrl
  : (import.meta.env.VITE_SUPABASE_URL as string | undefined);

const supabaseAnonKey = useDevCredentials
  ? devAnonKey
  : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

function normalizeSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return `https://${url}.supabase.co`;
}

const supabaseUrl = normalizeSupabaseUrl(rawUrl);

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
