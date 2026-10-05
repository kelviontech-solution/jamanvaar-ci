import { en } from './en';
import { hi } from './hi';
import { gu } from './gu';
import { mr } from './mr';
import { ta } from './ta';
import { te } from './te';
import { kn } from './kn';

export type SupportedLanguage = 'en' | 'hi' | 'gu' | 'mr' | 'ta' | 'te' | 'kn';
export type TranslationKey = keyof typeof en;

export const translations: Record<SupportedLanguage, typeof en> = {
  en,
  hi: hi as unknown as typeof en,
  gu: gu as unknown as typeof en,
  mr: mr as unknown as typeof en,
  ta: ta as unknown as typeof en,
  te: te as unknown as typeof en,
  kn: kn as unknown as typeof en
};

export function getTranslation(lang: SupportedLanguage = 'en'): typeof en {
  return translations[lang] || translations.en;
}

export function translate(key: TranslationKey, lang: SupportedLanguage = 'en'): string {
  const dict = getTranslation(lang);
  const value = dict[key];
  if (typeof value === 'string') return value;
  return translations.en[key] as string || String(key);
}
