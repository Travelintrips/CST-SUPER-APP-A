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
    const origin = getOrigin();
    const base = getBase();
    const isInIframe = window !== window.top;

    if (isInIframe) {
      // In iframe (Replit preview): open popup with returnTo=popup sentinel.
      // The popup will postMessage "auth:done" then close itself.
      const loginUrl = `${origin}/api/login/google?returnTo=${encodeURIComponent("popup")}`;
      const authWindow = window.open(loginUrl, "_blank", "width=500,height=650,popup");

      if (authWindow) {
        const onMessage = (evt: MessageEvent) => {
          if (evt.data === "auth:done") {
            window.removeEventListener("message", onMessage);
            clearInterval(poll);
            // Fetch user immediately after popup signals success
            fetch("/api/auth/user", { credentials: "include" })
              .then((r) => r.json())
              .then((data: { user: AuthUser | null }) => {
                if (data.user) { writeCache(data.user); setUser(data.user); }
              })
              .catch(() => {});
          } else if (evt.data === "auth:error") {
            window.removeEventListener("message", onMessage);
            clearInterval(poll);
          }
        };
        window.addEventListener("message", onMessage);

        // Fallback polling in case postMessage doesn't work (cross-origin popup)
        const poll = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(poll);
            window.removeEventListener("message", onMessage);
            fetch("/api/auth/user", { credentials: "include" })
              .then((r) => r.json())
              .then((data: { user: AuthUser | null }) => {
                if (data.user) { writeCache(data.user); setUser(data.user); }
              })
              .catch(() => {});
          }
        }, 1000);
        setTimeout(() => {
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
        }, 5 * 60 * 1000);
      } else {
        // Popup blocked — navigate the iframe directly using a normal returnTo
        // (NOT the "popup" sentinel, which would render the close-me page).
        const currentPath = window.location.pathname + window.location.search;
        const fallbackReturnTo = encodeURIComponent(currentPath !== "/" ? currentPath : base);
        const fallbackUrl = `${origin}/api/login/google?returnTo=${fallbackReturnTo}`;
        window.location.href = fallbackUrl;
      }
    } else {
      // Not in iframe: normal redirect flow
      const currentPath = window.location.pathname + window.location.search;
      const returnTo = encodeURIComponent(currentPath !== "/" ? currentPath : base);
      window.location.href = `${origin}/api/login/google?returnTo=${returnTo}`;
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
