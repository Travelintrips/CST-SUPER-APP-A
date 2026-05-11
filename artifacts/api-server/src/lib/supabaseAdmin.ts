import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function verifySupabaseToken(token: string) {
  if (!url || !key) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user || !user.email) return null;
  return user;
}
