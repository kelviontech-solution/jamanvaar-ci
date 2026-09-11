import { describe, it, expect } from 'vitest';
import { transliterateToDevanagari, transliterateToGujarati, devanagariToGujarati } from '@jamanvaar/utils';

/**
 * Covers the phonetic Roman->Devanagari->Gujarati typing aid added for
 * Kiosk Admin's virtual keyboard — an admin without a native-script
 * keyboard types phonetically and sees Devanagari/Gujarati populate live.
 * This is intentionally a best-effort typing aid, not a translator, so
 * these tests check the mechanics (consonant clusters, matras, vowels,
 * the Devanagari->Gujarati codepoint shift) rather than claiming every
 * possible word transliterates perfectly.
 */
describe('transliterateToDevanagari', () => {
  it('resolves a lone consonant to its inherent-a form', () => {
    expect(transliterateToDevanagari('k')).toBe('क');
  });

  it('applies a vowel matra onto a preceding consonant', () => {
    expect(transliterateToDevanagari('ki')).toBe('कि');
    expect(transliterateToDevanagari('ka')).toBe('क');
    expect(transliterateToDevanagari('kaa')).toBe('का');
  });

  it('forms a consonant cluster with an implicit virama when two consonants are adjacent', () => {
    // "makkhan" -> म + क् + ख + न (butter)
    expect(transliterateToDevanagari('makkhan')).toBe('मक्खन');
  });

  it('resolves an independent vowel when no consonant is pending', () => {
    expect(transliterateToDevanagari('aam')).toBe('आम');
  });

  it('passes through spaces and digits untouched', () => {
    expect(transliterateToDevanagari('paneer 2 pcs')).toContain(' 2 ');
  });

  it('handles retroflex vs dental consonants distinctly by capitalization', () => {
    expect(transliterateToDevanagari('t')).toBe('त');
    expect(transliterateToDevanagari('T')).toBe('ट');
  });
});

describe('devanagariToGujarati / transliterateToGujarati', () => {
  it('shifts known Devanagari letters to their Gujarati counterparts by the fixed +0x180 offset', () => {
    expect(devanagariToGujarati('क')).toBe('ક');
    expect(devanagariToGujarati('अ')).toBe('અ');
    expect(devanagariToGujarati('ा')).toBe('ા');
    expect(devanagariToGujarati('ं')).toBe('ં');
  });

  it('leaves non-Devanagari characters (spaces, digits, Latin) untouched', () => {
    expect(devanagariToGujarati('पनीर 5')).toBe('પનીર 5');
  });

  it('produces a Gujarati word end-to-end from phonetic Roman input', () => {
    expect(transliterateToGujarati('ki')).toBe('કિ');
    expect(transliterateToGujarati('makkhan')).toBe('મક્ખન');
  });
});
