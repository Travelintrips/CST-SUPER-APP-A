import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

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
  return (window as any).__BASE_PATH__ || import.meta.env.BASE_URL || "/bizportal/";
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
      if (res.status >= 500) {
        // Transient server error (e.g. DB connection drop). Don't clear the
        // cached session — the client will retry on the next interaction.
        return;
      }
      if (!res.ok) {
        // 401/403 → definitely not authenticated
        setUser(null);
        writeCache(null);
        return;
      }
      const data = await res.json() as { user: AuthUser | null };
      const u = data.user ?? null;
      setUser(u);
      writeCache(u);
    } catch {
      // Network error — keep existing cached session, don't flash login screen
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signInWithGoogle = useCallback(() => {
    // Use the current page path as returnTo so admin lands back on the intended page after login.
    // Falls back to the base path if the current path is just the base.
    const currentPath = window.location.pathname + window.location.search;
    const base = getBase();
    const returnTo = encodeURIComponent(currentPath !== "/" ? currentPath : base);
    const origin = getOrigin();
    const loginUrl = `${origin}/api/login/google?returnTo=${returnTo}`;

    const isInIframe = window !== window.top;
    if (isInIframe) {
      const authWindow = window.open(loginUrl, "_blank", "noopener");
      if (authWindow) {
        const poll = setInterval(() => {
          fetch("/api/auth/user", { credentials: "include" })
            .then((r) => r.json())
            .then((data: { user: AuthUser | null }) => {
              if (data.user) {
                clearInterval(poll);
                writeCache(data.user);
                setUser(data.user);
              }
            })
            .catch(() => {});
        }, 2000);
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
      } else {
        try {
          if (window.top) window.top.location.href = loginUrl;
          else window.location.href = loginUrl;
        } catch {
          window.location.href = loginUrl;
        }
      }
    } else {
      window.location.href = loginUrl;
    }
  }, []);

  const signInWithEmail = useCallback(async (_email: string, _password: string) => {
    return { error: "Email login is not supported. Please use Google login." };
  }, []);

  const signOut = useCallback(() => {
    writeCache(null);
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
