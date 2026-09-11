/**
 * Phonetic Roman-to-Devanagari transliteration (ITRANS-inspired), plus a
 * Devanagari->Gujarati converter derived from the fixed +0x180 codepoint
 * offset the two Unicode blocks share for the vast majority of letters.
 *
 * This is a typing AID, not a translator: it converts how a word SOUNDS
 * (typed in Roman letters) into the matching Devanagari/Gujarati script,
 * the same approach tools like Google Input Tools use. It does not know
 * meaning, grammar, or dental/retroflex ambiguity a casual typist won't
 * indicate — the caller is expected to show a live preview and let the
 * admin correct it before saving, never treat the output as guaranteed
 * correct.
 */

// Longest-match-first phonetic tokens. Order within a length group doesn't
// matter; the tokenizer always tries longer keys before shorter ones.
const VOWEL_INDEPENDENT: Record<string, string> = {
  aa: 'आ', A: 'आ',
  ii: 'ई', I: 'ई',
  uu: 'उ' /* placeholder overwritten below */,
  RRi: 'ऋ',
  ai: 'ऐ',
  au: 'औ',
  a: 'अ',
  i: 'इ',
  u: 'उ',
  e: 'ए',
  o: 'ओ'
};
// uu independent vowel is U+090A, fix the accidental duplicate key above.
VOWEL_INDEPENDENT.uu = 'ऊ';
VOWEL_INDEPENDENT.U = 'ऊ';

const VOWEL_MATRA: Record<string, string> = {
  aa: 'ा', A: 'ा',
  ii: 'ी', I: 'ी',
  uu: 'ू', U: 'ू',
  RRi: 'ृ',
  ai: 'ै',
  au: 'ौ',
  i: 'ि',
  u: 'ु',
  e: 'े',
  o: 'ो'
  // 'a' intentionally omitted — the inherent vowel needs no matra.
};

const CONSONANTS: Record<string, string> = {
  kh: 'ख', k: 'क',
  gh: 'घ', g: 'ग',
  chh: 'छ', ch: 'च', c: 'च',
  jh: 'झ', j: 'ज',
  Th: 'ठ', T: 'ट',
  Dh: 'ढ', D: 'ड',
  N: 'ण', // retroflex n
  th: 'थ', t: 'त',
  dh: 'ध', d: 'द',
  n: 'न',
  ph: 'फ', f: 'फ',
  bh: 'भ', b: 'ब',
  m: 'म',
  y: 'य',
  r: 'र',
  l: 'ल',
  L: 'ळ', // retroflex l
  v: 'व', w: 'व',
  Sh: 'ष', sh: 'श', s: 'स',
  h: 'ह',
  z: 'ज़', // za (nukta) — common in loanwords like "pizza"
  q: 'क़',
  x: 'क्ष' // "x" as a convenience alias for "ksha"
};

const SPECIAL: Record<string, string> = {
  '.n': 'ं', M: 'ं', // anusvara
  '.m': 'ं',
  H: 'ः', // visarga
  '~n': 'ँ' // chandrabindu
};

// All recognized tokens, longest-first, for greedy matching.
const ALL_TOKENS: Array<{ key: string; type: 'vowel' | 'consonant' | 'special' }> = [
  ...Object.keys(VOWEL_INDEPENDENT).map((key) => ({ key, type: 'vowel' as const })),
  ...Object.keys(CONSONANTS).map((key) => ({ key, type: 'consonant' as const })),
  ...Object.keys(SPECIAL).map((key) => ({ key, type: 'special' as const }))
].sort((a, b) => b.key.length - a.key.length);

const VIRAMA = '्';

/**
 * Converts phonetically-typed Roman text (e.g. "paneer tikka") into
 * Devanagari (e.g. "पनीर टिक्का" — approximately; retroflex vs dental
 * consonants depend on capitalization per ITRANS convention, see module
 * doc comment).
 */
export function transliterateToDevanagari(input: string): string {
  let out = '';
  let pendingConsonant: string | null = null;
  let i = 0;

  const flushPending = () => {
    if (pendingConsonant !== null) {
      out += pendingConsonant; // inherent "a" — no matra needed
      pendingConsonant = null;
    }
  };

  while (i < input.length) {
    const ch = input[i];

    // Pass through whitespace, digits, and punctuation untouched — only
    // letters participate in transliteration.
    if (!/[a-zA-Z.~]/.test(ch)) {
      flushPending();
      out += ch;
      i++;
      continue;
    }

    const remaining = input.slice(i, i + 4);
    // Case-sensitive first (retroflex capitals like T/D/N matter), then a
    // case-insensitive fallback so an admin who doesn't know that
    // convention still gets *a* reasonable letter instead of nothing.
    const match =
      ALL_TOKENS.find((t) => remaining.startsWith(t.key)) ??
      ALL_TOKENS.find((t) => remaining.toLowerCase().startsWith(t.key.toLowerCase()));

    if (!match) {
      // Unrecognized letter combination — emit as-is so nothing silently
      // vanishes; the live preview will make this obvious to fix.
      flushPending();
      out += ch;
      i++;
      continue;
    }

    const { key, type } = match;

    if (type === 'consonant') {
      if (pendingConsonant !== null) {
        out += pendingConsonant + VIRAMA;
      }
      pendingConsonant = CONSONANTS[key];
    } else if (type === 'vowel') {
      if (pendingConsonant !== null) {
        const matra = key === 'a' ? '' : VOWEL_MATRA[key];
        out += pendingConsonant + (matra ?? '');
        pendingConsonant = null;
      } else {
        out += VOWEL_INDEPENDENT[key];
      }
    } else {
      flushPending();
      out += SPECIAL[key];
    }

    i += key.length;
  }

  flushPending();
  return out;
}

const DEVANAGARI_TO_GUJARATI_OFFSET = 0x0180;

/**
 * Shifts Devanagari codepoints to their Gujarati counterparts. Reliable for
 * the core letters (independent vowels, consonants, matras, anusvara,
 * visarga, virama) because the two Unicode blocks were designed with a
 * fixed +0x180 offset between them for exactly those letters.
 */
export function devanagariToGujarati(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0900 && code <= 0x097f) {
      out += String.fromCodePoint(code + DEVANAGARI_TO_GUJARATI_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

export function transliterateToGujarati(input: string): string {
  return devanagariToGujarati(transliterateToDevanagari(input));
}
