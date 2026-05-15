import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
