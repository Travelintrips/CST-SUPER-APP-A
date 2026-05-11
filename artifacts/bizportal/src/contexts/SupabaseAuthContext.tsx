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

function getBase(): string {
  return (window as any).__BASE_PATH__ || import.meta.env.BASE_URL || "/bizportal/";
}

function getOrigin(): string {
  return window.location.origin;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { user: AuthUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signInWithGoogle = useCallback(() => {
    const base = getBase();
    const returnTo = encodeURIComponent(base);
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
                setUser(data.user);
              }
            })
            .catch(() => {});
        }, 2000);
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
      } else {
        window.location.href = loginUrl;
      }
    } else {
      window.location.href = loginUrl;
    }
  }, []);

  const signInWithEmail = useCallback(async (_email: string, _password: string) => {
    return { error: "Email login is not supported. Please use Google login." };
  }, []);

  const signOut = useCallback(() => {
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
