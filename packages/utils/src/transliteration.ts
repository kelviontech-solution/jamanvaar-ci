/**
 * Phonetic Roman-to-native-script transliteration (ITRANS-inspired) for every script the kiosk's
 * virtual keyboard supports, plus a Devanagari->Gujarati converter derived from the fixed +0x180
 * codepoint offset the two Unicode blocks share for the vast majority of letters.
 *
 * This is a typing AID, not a translator: it converts how a word SOUNDS (typed in Roman letters)
 * into the matching native script, the same approach tools like Google Input Tools use. It does
 * not know meaning, grammar, or dental/retroflex ambiguity a casual typist won't indicate — the
 * caller is expected to show a live preview and let the admin correct it before saving, never
 * treat the output as guaranteed correct. This applies even more to Tamil, whose native consonant
 * inventory is smaller than Devanagari's (one letter covers a whole aspirated/voiced series), so
 * several Roman keys deliberately collapse onto the same Tamil letter below.
 */

interface AbugidaTables {
  /** A vowel typed with no consonant immediately before it (its own standalone letter). */
  independentVowels: Record<string, string>;
  /** The same vowel sounds, as the diacritic mark attached to a preceding consonant. Must share
   *  the exact same key set as independentVowels, except 'a' (the inherent vowel needs no mark). */
  vowelMatras: Record<string, string>;
  consonants: Record<string, string>;
  special?: Record<string, string>;
  /** The mark that strips a consonant's inherent "a" when another consonant immediately follows it. */
  virama: string;
}

type Token = { key: string; type: 'vowel' | 'consonant' | 'special' };

function buildTokens(tables: AbugidaTables): Token[] {
  return [
    ...Object.keys(tables.independentVowels).map((key) => ({ key, type: 'vowel' as const })),
    ...Object.keys(tables.consonants).map((key) => ({ key, type: 'consonant' as const })),
    ...Object.keys(tables.special ?? {}).map((key) => ({ key, type: 'special' as const }))
  ].sort((a, b) => b.key.length - a.key.length);
}

/**
 * Converts phonetically-typed Roman text (e.g. "paneer tikka") into the native script described
 * by `tables` — approximately; retroflex vs dental consonants depend on capitalization per
 * ITRANS convention, see this module's own doc comment.
 */
function transliterateAbugida(input: string, tables: AbugidaTables): string {
  const tokens = buildTokens(tables);
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

    // Pass through whitespace, digits, and punctuation untouched — only letters participate.
    if (!/[a-zA-Z.~]/.test(ch)) {
      flushPending();
      out += ch;
      i++;
      continue;
    }

    const remaining = input.slice(i, i + 4);
    // Case-sensitive first (retroflex capitals like T/D/N matter), then a case-insensitive
    // fallback so a typist who doesn't know that convention still gets *a* reasonable letter.
    const match = tokens.find((t) => remaining.startsWith(t.key)) ?? tokens.find((t) => remaining.toLowerCase().startsWith(t.key.toLowerCase()));

    if (!match) {
      // Unrecognized letter combination — emit as-is so nothing silently vanishes; the live
      // preview makes this obvious to fix.
      flushPending();
      out += ch;
      i++;
      continue;
    }

    const { key, type } = match;

    if (type === 'consonant') {
      if (pendingConsonant !== null) {
        out += pendingConsonant + tables.virama;
      }
      pendingConsonant = tables.consonants[key];
    } else if (type === 'vowel') {
      if (pendingConsonant !== null) {
        const matra = key === 'a' ? '' : tables.vowelMatras[key];
        out += pendingConsonant + (matra ?? '');
        pendingConsonant = null;
      } else {
        out += tables.independentVowels[key];
      }
    } else {
      flushPending();
      out += tables.special![key];
    }

    i += key.length;
  }

  flushPending();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Devanagari (Hindi, and Marathi — same script)
// ---------------------------------------------------------------------------------------------

const DEVANAGARI_INDEPENDENT_VOWELS: Record<string, string> = {
  aa: 'आ', A: 'आ',
  ii: 'ई', I: 'ई',
  uu: 'ऊ', U: 'ऊ',
  RRi: 'ऋ',
  ai: 'ऐ',
  au: 'औ',
  a: 'अ',
  i: 'इ',
  u: 'उ',
  e: 'ए',
  o: 'ओ'
};

const DEVANAGARI_VOWEL_MATRAS: Record<string, string> = {
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

const DEVANAGARI_CONSONANTS: Record<string, string> = {
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
  z: 'ज़', // za (nukta) — common in loanwords like "pizza"
  q: 'क़',
  x: 'क्ष' // "x" as a convenience alias for "ksha"
};

const DEVANAGARI_SPECIAL: Record<string, string> = {
  '.n': 'ं', M: 'ं', // anusvara
  '.m': 'ं',
  H: 'ः', // visarga
  '~n': 'ँ' // chandrabindu
};

const DEVANAGARI_TABLES: AbugidaTables = {
  independentVowels: DEVANAGARI_INDEPENDENT_VOWELS,
  vowelMatras: DEVANAGARI_VOWEL_MATRAS,
  consonants: DEVANAGARI_CONSONANTS,
  special: DEVANAGARI_SPECIAL,
  virama: '्'
};

export function transliterateToDevanagari(input: string): string {
  return transliterateAbugida(input, DEVANAGARI_TABLES);
}

/** Marathi is written in the same Devanagari script as Hindi — same phonetic typing aid applies. */
export function transliterateToMarathi(input: string): string {
  return transliterateToDevanagari(input);
}

const DEVANAGARI_TO_GUJARATI_OFFSET = 0x0180;

/**
 * Shifts Devanagari codepoints to their Gujarati counterparts. Reliable for the core letters
 * (independent vowels, consonants, matras, anusvara, visarga, virama) because the two Unicode
 * blocks were designed with a fixed +0x180 offset between them for exactly those letters.
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

// ---------------------------------------------------------------------------------------------
// Telugu
// ---------------------------------------------------------------------------------------------

const TELUGU_TABLES: AbugidaTables = {
  independentVowels: {
    aa: 'ఆ', A: 'ఆ',
    ii: 'ఈ', I: 'ఈ',
    uu: 'ఊ', U: 'ఊ',
    RRi: 'ఋ',
    ai: 'ఐ',
    au: 'ఔ',
    a: 'అ',
    i: 'ఇ',
    u: 'ఉ',
    e: 'ఎ',
    o: 'ఒ'
  },
  vowelMatras: {
    aa: 'ా', A: 'ా',
    ii: 'ీ', I: 'ీ',
    uu: 'ూ', U: 'ూ',
    RRi: 'ృ',
    ai: 'ై',
    au: 'ౌ',
    i: 'ి',
    u: 'ు',
    e: 'ె',
    o: 'ొ'
  },
  consonants: {
    kh: 'ఖ', k: 'క',
    gh: 'ఘ', g: 'గ',
    chh: 'ఛ', ch: 'చ', c: 'చ',
    jh: 'ఝ', j: 'జ',
    Th: 'ఠ', T: 'ట',
    Dh: 'ఢ', D: 'డ',
    N: 'ణ',
    th: 'థ', t: 'త',
    dh: 'ధ', d: 'ద',
    n: 'న',
    ph: 'ఫ', f: 'ఫ',
    bh: 'భ', b: 'బ',
    m: 'మ',
    y: 'య',
    r: 'ర',
    l: 'ల',
    L: 'ళ',
    v: 'వ', w: 'వ',
    Sh: 'ష', sh: 'శ', s: 'స',
    h: 'హ',
    x: 'క్ష'
  },
  special: {
    '.n': 'ం', M: 'ం',
    '.m': 'ం',
    H: 'ః'
  },
  virama: '్'
};

export function transliterateToTelugu(input: string): string {
  return transliterateAbugida(input, TELUGU_TABLES);
}

// ---------------------------------------------------------------------------------------------
// Kannada
// ---------------------------------------------------------------------------------------------

const KANNADA_TABLES: AbugidaTables = {
  independentVowels: {
    aa: 'ಆ', A: 'ಆ',
    ii: 'ಈ', I: 'ಈ',
    uu: 'ಊ', U: 'ಊ',
    RRi: 'ಋ',
    ai: 'ಐ',
    au: 'ಔ',
    a: 'ಅ',
    i: 'ಇ',
    u: 'ಉ',
    e: 'ಎ',
    o: 'ಒ'
  },
  vowelMatras: {
    aa: 'ಾ', A: 'ಾ',
    ii: 'ೀ', I: 'ೀ',
    uu: 'ೂ', U: 'ೂ',
    RRi: 'ೃ',
    ai: 'ೈ',
    au: 'ೌ',
    i: 'ಿ',
    u: 'ು',
    e: 'ೆ',
    o: 'ೊ'
  },
  consonants: {
    kh: 'ಖ', k: 'ಕ',
    gh: 'ಘ', g: 'ಗ',
    chh: 'ಛ', ch: 'ಚ', c: 'ಚ',
    jh: 'ಝ', j: 'ಜ',
    Th: 'ಠ', T: 'ಟ',
    Dh: 'ಢ', D: 'ಡ',
    N: 'ಣ',
    th: 'ಥ', t: 'ತ',
    dh: 'ಧ', d: 'ದ',
    n: 'ನ',
    ph: 'ಫ', f: 'ಫ',
    bh: 'ಭ', b: 'ಬ',
    m: 'ಮ',
    y: 'ಯ',
    r: 'ರ',
    l: 'ಲ',
    L: 'ಳ',
    v: 'ವ', w: 'ವ',
    Sh: 'ಷ', sh: 'ಶ', s: 'ಸ',
    h: 'ಹ',
    x: 'ಕ್ಷ'
  },
  special: {
    '.n': 'ಂ', M: 'ಂ',
    '.m': 'ಂ',
    H: 'ಃ'
  },
  virama: '್'
};

export function transliterateToKannada(input: string): string {
  return transliterateAbugida(input, KANNADA_TABLES);
}

// ---------------------------------------------------------------------------------------------
// Tamil — a smaller native consonant inventory than the scripts above: one letter per place of
// articulation covers its whole aspirated/unaspirated/voiced series (e.g. k/kh/g/gh all -> க), so
// several Roman keys deliberately collapse onto the same Tamil letter below. Loanword-only
// letters (ஜ/ஷ/ஸ/ஹ, the "Grantha" additions) cover sounds restaurant/English dish names need
// that pure Tamil orthography doesn't distinguish.
// ---------------------------------------------------------------------------------------------

const TAMIL_TABLES: AbugidaTables = {
  independentVowels: {
    aa: 'ஆ', A: 'ஆ',
    ii: 'ஈ', I: 'ஈ',
    uu: 'ஊ', U: 'ஊ',
    ai: 'ஐ',
    au: 'ஔ',
    a: 'அ',
    i: 'இ',
    u: 'உ',
    e: 'எ',
    o: 'ஒ'
  },
  vowelMatras: {
    aa: 'ா', A: 'ா',
    ii: 'ீ', I: 'ீ',
    uu: 'ூ', U: 'ூ',
    ai: 'ை',
    au: 'ௌ',
    i: 'ி',
    u: 'ு',
    e: 'ெ',
    o: 'ொ'
  },
  consonants: {
    // One Tamil letter per native place of articulation covers the whole aspirated/voiced series.
    kh: 'க', k: 'க', gh: 'க', g: 'க',
    ng: 'ங',
    chh: 'ச', ch: 'ச', c: 'ச',
    ny: 'ஞ',
    Th: 'ட', T: 'ட', Dh: 'ட', D: 'ட',
    N: 'ண', // retroflex n
    th: 'த', t: 'த', dh: 'த', d: 'த',
    n: 'ந', // dental n
    ph: 'ப', f: 'ப', bh: 'ப', p: 'ப', b: 'ப',
    m: 'ம',
    y: 'ய',
    r: 'ர',
    l: 'ல',
    L: 'ள', // retroflex l
    zh: 'ழ', // the distinct Tamil retroflex approximant
    v: 'வ', w: 'வ',
    R: 'ற', // hard/trilled r
    // Grantha loanword letters — needed for restaurant/English terms pure Tamil doesn't cover.
    j: 'ஜ',
    Sh: 'ஷ',
    s: 'ஸ',
    h: 'ஹ',
    x: 'க்ஷ'
  },
  virama: '்'
};

export function transliterateToTamil(input: string): string {
  return transliterateAbugida(input, TAMIL_TABLES);
}
