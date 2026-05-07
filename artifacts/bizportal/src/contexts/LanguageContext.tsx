import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { type Locale, type Translations, getTranslations } from "@/lib/translations";

const STORAGE_KEY = "app_locale";

const SUPPORTED_LOCALES: Locale[] = [
  "id-ID", "en-US", "en-GB", "zh-CN", "zh-TW", "ja-JP",
  "ko-KR", "ar-SA", "fr-FR", "de-DE", "es-ES", "pt-BR",
  "ru-RU", "hi-IN", "ms-MY", "th-TH", "vi-VN",
];

function detectInitialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const browser = navigator.language;
  const exact = SUPPORTED_LOCALES.find((l) => l === browser);
  if (exact) return exact;
  const prefix = browser.split("-")[0];
  const partial = SUPPORTED_LOCALES.find((l) => l.startsWith(prefix));
  return partial ?? "id-ID";
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
    document.documentElement.dir = newLocale === "ar-SA" ? "rtl" : "ltr";
  }, []);

  const t = useMemo(() => getTranslations(locale), [locale]);
  const isRTL = locale === "ar-SA";

  const value = useMemo(() => ({ locale, setLocale, t, isRTL }), [locale, setLocale, t, isRTL]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
