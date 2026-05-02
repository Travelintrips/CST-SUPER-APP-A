import { createContext, useContext, useState, ReactNode } from "react";
import { TRANSLATIONS, SUPPORTED_LOCALES, type SupportedLocale, type TranslationKey } from "./translations";

const STORAGE_KEY = "app_locale";

function getInitialLocale(): SupportedLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale;
  }
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
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<string>(getInitialLocale);

  function setLanguage(code: string) {
    setLocale(code);
    localStorage.setItem(STORAGE_KEY, code);
  }

  function t(key: TranslationKey): string {
    const dict =
      TRANSLATIONS[locale as SupportedLocale] ?? TRANSLATIONS["en-US"];
    return (dict as Record<string, string>)[key] ??
      (TRANSLATIONS["en-US"] as Record<string, string>)[key] ??
      key;
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
