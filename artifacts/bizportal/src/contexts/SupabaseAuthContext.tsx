import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextValue {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CACHE_KEY = "biz_auth_user_v1";

function readCache(): AuthUser | null {
  try {
    const v = sessionStorage.getItem(CACHE_KEY);
    return v ? (JSON.parse(v) as AuthUser) : null;
  } catch { return null; }
}

function writeCache(u: AuthUser | null) {
  try {
    if (u) sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

function getBase(): string {
  return (window as unknown as Record<string, string>).__BASE_PATH__ || import.meta.env.BASE_URL || "/bizportal/";
}

function getOrigin(): string {
  return window.location.origin;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const cached = readCache();
  const [user, setUser] = useState<AuthUser | null>(cached);
  const [isLoading, setIsLoading] = useState(!cached);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status >= 500) return;
      if (!res.ok) { setUser(null); writeCache(null); return; }
      const data = await res.json() as { user: AuthUser | null };
      const u = data.user ?? null;
      setUser(u);
      writeCache(u);
    } catch {
      // keep existing cache
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  // Exchange Supabase access_token → session cookie → set user state
  const exchangeToken = useCallback(async (access_token: string) => {
    try {
      const res = await fetch("/api/auth/supabase-exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token }),
      });
      if (res.ok) {
        const data = await res.json() as { user: AuthUser };
        if (data.user) { writeCache(data.user); setUser(data.user); }
      } else {
        await fetchUser();
      }
    } catch {
      await fetchUser();
    }
  }, [fetchUser]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      console.error("[BizPortal] Supabase tidak terkonfigurasi — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum di-set");
      return;
    }

    const origin = getOrigin();
    const base = getBase();
    // Callback page yang di-serve oleh BizPortal router di /bizportal/auth/callback
    const callbackUrl = `${origin}${base.replace(/\/$/, "")}/auth/callback`;
    const isInIframe = window !== window.top;

    if (isInIframe) {
      // Popup mode (BizPortal di dalam iframe Replit preview)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        console.error("[BizPortal] Gagal mendapat OAuth URL:", error);
        return;
      }

      // In iframe (Replit preview): open popup with returnTo=popup sentinel.
      // The popup will postMessage "auth:done" then close itself.
      const loginUrl = `${origin}/api/login/google?returnTo=${encodeURIComponent("popup")}`;
      const authWindow = window.open(loginUrl, "_blank", "width=500,height=650,popup");
      if (authWindow) {
        const onMessage = async (evt: MessageEvent) => {
          // Hanya terima pesan dari origin yang sama
          if (evt.origin !== origin) return;
          if (evt.data?.type === "supabase-auth" && typeof evt.data.access_token === "string") {
            window.removeEventListener("message", onMessage);
            clearInterval(poll);
            await exchangeToken(evt.data.access_token);
          } else if (evt.data === "auth:error") {
            window.removeEventListener("message", onMessage);
            clearInterval(poll);
          }
        };
        window.addEventListener("message", onMessage);

        // Fallback polling: jika popup tutup tanpa postMessage
        const poll = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(poll);
            window.removeEventListener("message", onMessage);
            fetchUser();
          }
        }, 1000);

        // Timeout 5 menit
        setTimeout(() => {
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
        }, 5 * 60 * 1000);
      } else {
        // Popup diblokir — fallback ke redirect langsung
        const { error: e2 } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: callbackUrl },
        });
        if (e2) console.error("[BizPortal] OAuth redirect gagal:", e2);
      }
    } else {
      // Bukan di iframe — redirect biasa, callback page akan handle exchange
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) console.error("[BizPortal] OAuth redirect gagal:", error);
    }
  }, [exchangeToken, fetchUser]);

  // Setelah redirect (non-iframe), callback page mengirim token via postMessage
  // atau user kembali ke halaman ini — cek session Supabase dan exchange
  useEffect(() => {
    if (!supabase) return;
    // Dengarkan SIGNED_IN dari Supabase (jika redirect ke halaman ini, bukan callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.access_token) {
        await exchangeToken(session.access_token);
      }
    });
    return () => subscription.unsubscribe();
  }, [exchangeToken]);

  const signInWithEmail = useCallback(async (_email: string, _password: string) => {
    return { error: "Email login tidak didukung. Gunakan Google login." };
  }, []);

  const signOut = useCallback(() => {
    writeCache(null);
    setUser(null);
    if (supabase) supabase.auth.signOut().catch(() => {});
    const base = getBase();
    window.location.href = `${getOrigin()}/api/logout?redirect=${encodeURIComponent(base)}`;
  }, []);

  const value: AuthContextValue = {
    session: user ? { user } : null,
    user,
    isLoading,
    isAuthenticated: !!user,
    signInWithGoogle,
    signInWithEmail,
    signOut,
    login: signInWithGoogle,
    logout: signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSupabaseAuth must be used within SupabaseAuthProvider");
  return ctx;
}
