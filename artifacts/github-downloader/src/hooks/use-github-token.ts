import { useState, useCallback } from "react";

const STORAGE_KEY = "github_pat";

function readToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function useGitHubToken() {
  const [token, setTokenState] = useState<string>(() => readToken());

  const setToken = useCallback((value: string) => {
    const trimmed = value.trim();
    writeToken(trimmed);
    setTokenState(trimmed);
  }, []);

  const clearToken = useCallback(() => {
    writeToken("");
    setTokenState("");
  }, []);

  return { token, setToken, clearToken, isAuthenticated: token.length > 0 };
}
