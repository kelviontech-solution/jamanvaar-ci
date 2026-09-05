import { en } from './en';
import { hi } from './hi';
import { gu } from './gu';

export type SupportedLanguage = 'en' | 'hi' | 'gu';
export type TranslationKey = keyof typeof en;

export const translations: Record<SupportedLanguage, typeof en> = {
  en,
  hi: hi as unknown as typeof en,
  gu: gu as unknown as typeof en
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
