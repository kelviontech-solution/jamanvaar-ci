import { describe, it, expect } from 'vitest';
import {
  transliterateToDevanagari,
  transliterateToGujarati,
  devanagariToGujarati,
  transliterateToMarathi,
  transliterateToTelugu,
  transliterateToKannada,
  transliterateToTamil
} from '@jamanvaar/utils';

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

describe('transliterateToMarathi', () => {
  it('is the same Devanagari engine (Marathi uses the same script as Hindi)', () => {
    expect(transliterateToMarathi('makkhan')).toBe(transliterateToDevanagari('makkhan'));
    expect(transliterateToMarathi('ki')).toBe('कि');
  });
});

describe('transliterateToTelugu', () => {
  it('resolves a lone consonant to its inherent-a form', () => {
    expect(transliterateToTelugu('k')).toBe('క');
  });

  it('applies a vowel matra onto a preceding consonant', () => {
    expect(transliterateToTelugu('ki')).toBe('కి');
    expect(transliterateToTelugu('kaa')).toBe('కా');
  });

  it('forms a consonant cluster with an implicit virama when two consonants are adjacent', () => {
    expect(transliterateToTelugu('nk')).toBe('న్క');
  });

  it('resolves an independent vowel when no consonant is pending', () => {
    expect(transliterateToTelugu('a')).toBe('అ');
    expect(transliterateToTelugu('i')).toBe('ఇ');
  });

  it('handles retroflex vs dental consonants distinctly by capitalization', () => {
    expect(transliterateToTelugu('t')).toBe('త');
    expect(transliterateToTelugu('T')).toBe('ట');
  });

  it('passes through spaces and digits untouched', () => {
    expect(transliterateToTelugu('paneer 2 pcs')).toContain(' 2 ');
  });
});

describe('transliterateToKannada', () => {
  it('resolves a lone consonant to its inherent-a form', () => {
    expect(transliterateToKannada('k')).toBe('ಕ');
  });

  it('applies a vowel matra onto a preceding consonant', () => {
    expect(transliterateToKannada('ki')).toBe('ಕಿ');
    expect(transliterateToKannada('kaa')).toBe('ಕಾ');
  });

  it('forms a consonant cluster with an implicit virama when two consonants are adjacent', () => {
    expect(transliterateToKannada('nk')).toBe('ನ್ಕ');
  });

  it('resolves an independent vowel when no consonant is pending', () => {
    expect(transliterateToKannada('a')).toBe('ಅ');
    expect(transliterateToKannada('i')).toBe('ಇ');
  });

  it('handles retroflex vs dental consonants distinctly by capitalization', () => {
    expect(transliterateToKannada('t')).toBe('ತ');
    expect(transliterateToKannada('T')).toBe('ಟ');
  });
});

describe('transliterateToTamil', () => {
  it('resolves a lone consonant to its inherent-a form', () => {
    expect(transliterateToTamil('k')).toBe('க');
  });

  it('applies a vowel matra onto a preceding consonant', () => {
    expect(transliterateToTamil('ki')).toBe('கி');
    expect(transliterateToTamil('kaa')).toBe('கா');
  });

  it("collapses the whole aspirated/voiced series onto Tamil's one native letter per place of articulation", () => {
    expect(transliterateToTamil('k')).toBe(transliterateToTamil('kh'));
    expect(transliterateToTamil('k')).toBe(transliterateToTamil('g'));
    expect(transliterateToTamil('k')).toBe(transliterateToTamil('gh'));
  });

  it('gives the Grantha loanword letters (j, s, h, Sh) their own distinct output, not collapsed into a native letter', () => {
    expect(transliterateToTamil('j')).toBe('ஜ');
    expect(transliterateToTamil('ch')).not.toBe(transliterateToTamil('j'));
    expect(transliterateToTamil('s')).toBe('ஸ');
  });

  it('resolves the distinct Tamil retroflex approximant zh and retroflex l L separately from plain l', () => {
    expect(transliterateToTamil('zh')).toBe('ழ');
    expect(transliterateToTamil('L')).toBe('ள');
    expect(transliterateToTamil('l')).toBe('ல');
    expect(new Set([transliterateToTamil('zh'), transliterateToTamil('L'), transliterateToTamil('l')]).size).toBe(3);
  });

  it('forms a consonant cluster with an implicit virama when two consonants are adjacent', () => {
    expect(transliterateToTamil('nj')).toBe('ந்ஜ');
  });

  it('resolves an independent vowel when no consonant is pending', () => {
    expect(transliterateToTamil('a')).toBe('அ');
    expect(transliterateToTamil('i')).toBe('இ');
  });

  it('passes through spaces and digits untouched', () => {
    expect(transliterateToTamil('paneer 2 pcs')).toContain(' 2 ');
  });
});
