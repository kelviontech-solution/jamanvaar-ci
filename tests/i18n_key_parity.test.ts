import { describe, it, expect } from 'vitest';
import { en, hi, gu, mr, ta, te, kn, translations, getTranslation, translate } from '@jamanvaar/i18n';

/**
 * Every language file must translate exactly the same set of keys as en.ts (including the nested
 * quickNotes group) — a missing key falls back to English silently (see i18n.ts's own translate()),
 * which is the kind of half-translated screen that's easy to ship by accident when a new key is
 * added to en.ts but a translator forgets one of six other files.
 */
describe('i18n key parity — every language matches en.ts exactly', () => {
  const enKeys = Object.keys(en).sort();
  const enQuickNoteKeys = Object.keys(en.quickNotes).sort();

  const languages: Array<[string, typeof en]> = [
    ['hi', hi as unknown as typeof en],
    ['gu', gu as unknown as typeof en],
    ['mr', mr as unknown as typeof en],
    ['ta', ta as unknown as typeof en],
    ['te', te as unknown as typeof en],
    ['kn', kn as unknown as typeof en]
  ];

  for (const [code, dict] of languages) {
    it(`${code} has exactly the same top-level keys as en`, () => {
      expect(Object.keys(dict).sort()).toEqual(enKeys);
    });

    it(`${code} has exactly the same quickNotes keys as en`, () => {
      expect(Object.keys(dict.quickNotes).sort()).toEqual(enQuickNoteKeys);
    });

    it(`${code} has no empty-string values (a blank translation is worse than a missing one)`, () => {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value === 'string') {
          expect(value.trim(), `${code}.${key} is blank`).not.toBe('');
        }
      }
    });

    it(`${code} is actually non-English for keys with no Latin-script brand/CTA punctuation reason to match`, () => {
      // welcomeLine1/2 legitimately contain only the {{name}} placeholder (no literal translated
      // text of its own) — every other key should differ from the English source string, or the
      // translation was accidentally left as a copy-paste of en.ts.
      const skip = new Set(['welcomeLine1', 'welcomeLine2', 'cgst', 'sgst']);
      for (const [key, value] of Object.entries(en)) {
        if (skip.has(key) || typeof value !== 'string') continue;
        expect(dict[key as keyof typeof en], `${code}.${key} is identical to the English source`).not.toBe(value);
      }
    });
  }

  it('translations record is registered for all seven supported languages', () => {
    expect(Object.keys(translations).sort()).toEqual(['en', 'gu', 'hi', 'kn', 'mr', 'ta', 'te']);
  });

  it('getTranslation falls back to English for an unknown language rather than throwing', () => {
    expect(getTranslation('xx' as never)).toBe(translations.en);
  });

  it('translate() resolves a real key in every new language', () => {
    expect(translate('startOrder', 'mr')).not.toBe('');
    expect(translate('startOrder', 'ta')).not.toBe('');
    expect(translate('startOrder', 'te')).not.toBe('');
    expect(translate('startOrder', 'kn')).not.toBe('');
  });
});
