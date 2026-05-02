// @refresh reset
import { createContext, useContext, useState, ReactNode } from "react";
import { TRANSLATIONS, SUPPORTED_LOCALES, type SupportedLocale } from "./translations";

const STORAGE_KEY = "app_language";

function resolve(obj: Record<string, any>, keys: string[]): string | undefined {
  let cur: any = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return typeof cur === "string" ? cur : undefined;
}

function getInitialLocale(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const browser = navigator.language;
  const exact = SUPPORTED_LOCALES.find((l) => l === browser);
  if (exact) return exact;
  const partial = SUPPORTED_LOCALES.find(
    (l) => l.split("-")[0] === browser.split("-")[0]
  );
  return partial ?? "id-ID";
}

interface LanguageContextValue {
  locale: string;
  setLanguage: (code: string) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<string>(getInitialLocale);

  function setLanguage(code: string) {
    setLocale(code);
    localStorage.setItem(STORAGE_KEY, code);
  }

  function t(key: string, fallback?: string): string {
    const keys = key.split(".");
    const primaryDict = TRANSLATIONS[locale as SupportedLocale];
    if (primaryDict) {
      const val = resolve(primaryDict as Record<string, any>, keys);
      if (val !== undefined) return val;
    }
    const enUS = TRANSLATIONS["en-US"];
    if (enUS) {
      const val = resolve(enUS as Record<string, any>, keys);
      if (val !== undefined) return val;
    }
    const idID = TRANSLATIONS["id-ID"];
    if (idID) {
      const val = resolve(idID as Record<string, any>, keys);
      if (val !== undefined) return val;
    }
    return fallback ?? key;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within <LanguageProvider>");
  return ctx;
}
