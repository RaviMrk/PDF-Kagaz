import { createInstance } from 'i18next';
import type i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import hi from './hi.json';
import mr from './mr.json';

export const SUPPORTED_LANGUAGES = ['en', 'mr', 'hi'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function toSupported(code: string | null | undefined): AppLanguage | null {
  const base = code?.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find((l) => l === base) ?? null;
}

/** Saved preference wins, then the first supported device locale, else 'en'. */
export function resolveLanguage(preferred: string | null, deviceLocales: string[]): AppLanguage {
  const fromPreferred = toSupported(preferred);
  if (fromPreferred) return fromPreferred;
  for (const locale of deviceLocales) {
    const match = toSupported(locale);
    if (match) return match;
  }
  return 'en';
}

/**
 * Creates a fresh i18next instance per call (safe to call repeatedly) and
 * binds it to react-i18next. Resources are bundled, so init is synchronous.
 */
export function initI18n(preferred: string | null): typeof i18next {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    lng: toSupported(preferred) ?? 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      mr: { translation: mr },
      hi: { translation: hi },
    },
    returnNull: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
