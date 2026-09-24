/**
 * Staff PIN hashing (BUG-005/006/009/011, B2-014). PINs used to sit in `User.pinCode` as
 * plain 4-digit text, and every login screen (POS, Captain, KDS, Kiosk) compared
 * against it directly with `===`. This package is bundled into every terminal's
 * browser/Tauri renderer and has no server round-trip for a PIN check (it must
 * work fully offline), so this is a keyed hash — not a server-side check — kept
 * out of plaintext at rest on the terminal's local store/export/backup file.
 * It is not the product's real security boundary for a POS terminal (physical
 * possession of the device is), but "plaintext PIN sitting in the DB" is worth
 * closing regardless.
 *
 * B2-014 / security-audit MED-05: this was fixed independently on two branches — one
 * (kept here) replaced the hash with real PBKDF2-HMAC-SHA256 via Web Crypto
 * `subtle.deriveBits`; the other built a dependency-free, synchronous "stretched" FNV-1a
 * mix, reasoning that this package couldn't depend on an async crypto API since every
 * caller checked a PIN synchronously. That constraint no longer holds: this same B2-014
 * fix already made every caller (`StaffRepository.createUser`/`resetPin`/`verifyPin`, and
 * every login screen that calls them) `async`, so there is no synchronous call site left
 * to accommodate. With that constraint gone, a real, standards-based KDF (PBKDF2) is
 * strictly stronger than a hand-rolled stretch of a non-cryptographic mixing function —
 * this is the same primitive this codebase already trusts for license-certificate
 * verification in `packages/business/src/license_certificate.ts` — so PBKDF2 is what's
 * kept, not the synchronous alternative.
 *
 * The original hash here was two rounds of FNV-1a (a fast, non-cryptographic checksum,
 * not a security hash) over a single hardcoded salt baked into the shipped client bundle
 * (`jamanvaar-pin`) — so with only 10,000 possible 4-digit PINs, anyone who read the
 * bundle (trivial; it's shipped to the browser) could precompute every PIN's hash once
 * and instantly reverse any stolen `pinHash`, for every restaurant. Replaced with
 * PBKDF2-HMAC-SHA256 with a random salt generated fresh per hash and a deliberately high
 * iteration count, so: (a) no salt can be precomputed against ahead of time, and (b) even
 * with the hash and salt in hand, checking all 10,000 candidate PINs costs real,
 * deliberately-slowed CPU time instead of microseconds. This does not make a 4-digit PIN
 * "secure" in an absolute sense — no hash can, the keyspace is too small — it closes the
 * specific "reversed in milliseconds" gap. The real mitigations for the small keyspace
 * are (a) not letting the hash leak to an untrusted device in the first place, and (b)
 * rate-limiting/locking out PIN attempts wherever one is checked (see B2-030/MED-07).
 */

import { secureRandomBytes, secureRandomIndex } from '@jamanvaar/utils';

const HASH_PREFIX_V1 = 'pinv1:'; // legacy FNV-1a — verify-only, never issued again
const HASH_PREFIX_V2 = 'pinv2:'; // PBKDF2-HMAC-SHA256 — current

const PBKDF2_ITERATIONS = 100_000; // ~30-80ms per check on typical hardware: a deliberate,
// noticeable-if-you-time-it slowdown from the old hash's microseconds, while staying well
// under anything a cashier would perceive as lag on a single login attempt.
const PBKDF2_HASH_BITS = 256;
const SALT_BYTES = 16;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The pre-B2-014 algorithm, kept only so a PIN issued before this fix still logs in. */
function legacyHashPinV1(pin: string, restaurantId: string): string {
  const salted = `${restaurantId}:${pin}:jamanvaar-pin`;
  const a = fnv1a(salted);
  const b = fnv1a(`${a.toString(16)}:${salted}`);
  return HASH_PREFIX_V1 + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Same-length string compare that doesn't short-circuit on the first differing byte. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Hex(pin: string, restaurantId: string, salt: Uint8Array): Promise<string> {
  const subtle = (globalThis.crypto as Crypto).subtle;
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(`${restaurantId}:${pin}`),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    PBKDF2_HASH_BITS
  );
  return bytesToHex(new Uint8Array(derived));
}

/** Keyed by restaurantId + a fresh random salt per call, stretched via PBKDF2-HMAC-SHA256. */
export async function hashPin(pin: string, restaurantId: string): Promise<string> {
  const salt = secureRandomBytes(SALT_BYTES);
  const hashHex = await pbkdf2Hex(pin, restaurantId, salt);
  return `${HASH_PREFIX_V2}${bytesToHex(salt)}:${hashHex}`;
}

export async function verifyPinHash(pin: string, restaurantId: string, storedHash: string | undefined): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith(HASH_PREFIX_V2)) {
    const [saltHex, hashHex] = storedHash.slice(HASH_PREFIX_V2.length).split(':');
    const salt = saltHex ? hexToBytes(saltHex) : null;
    if (!salt || !hashHex) return false;
    const candidateHex = await pbkdf2Hex(pin, restaurantId, salt);
    return constantTimeEqual(candidateHex, hashHex);
  }
  if (storedHash.startsWith(HASH_PREFIX_V1)) {
    return constantTimeEqual(legacyHashPinV1(pin, restaurantId), storedHash);
  }
  return false;
}

/** True for anything that still looks like an old plaintext 4-digit PIN, not one of our hashes (any version). */
export function isPlaintextPin(value: string | undefined): boolean {
  return typeof value === 'string' && !value.startsWith(HASH_PREFIX_V1) && !value.startsWith(HASH_PREFIX_V2);
}

/**
 * A fast, unsalted, non-cryptographic fingerprint used ONLY to steer `generateUniquePin` away
 * from a PIN that's already assigned to someone else in the same restaurant — a UX/attribution
 * correctness check (two staff sharing a PIN is ambiguous at login), not a security control.
 * The real access-control secret is `hashPin` above. Deliberately kept off `StaffRepository`'s
 * sync payload (see `toSyncPayload`) and never sent to any other device: unlike `pinHash`, this
 * value IS trivially reversible (that's what makes it fast enough to check 10,000 candidates
 * synchronously), so it must never travel anywhere a `pinv1` hash used to.
 */
export function pinFingerprint(pin: string, restaurantId: string): string {
  return fnv1a(`${restaurantId}:${pin}:fingerprint`).toString(16);
}

/** True for a PIN an attacker would guess first: all one digit, or 4 consecutive ascending/descending digits. */
function isObviousPattern(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true; // 0000, 1111, ...
  const d = pin.split('').map(Number);
  const ascending = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const descending = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return ascending || descending; // 0123..6789, 9876..3210
}

/**
 * A random 4-digit PIN whose fingerprint doesn't collide with `existingFingerprints`. Never
 * returns an all-same-digit or 4-in-a-row sequential PIN, or one of a short list of other
 * commonly-guessed patterns (1212, 0001, ...), first — those are tried last, not banned outright,
 * so this always terminates even in a near-full 10,000-PIN restaurant.
 */
export function generateUniquePin(restaurantId: string, existingFingerprints: Iterable<string>): string {
  const taken = new Set(existingFingerprints);
  const extraWeak = new Set(['1212', '0001']); // not caught by isObviousPattern but still common guesses
  const weak = (pin: string) => isObviousPattern(pin) || extraWeak.has(pin);
  const candidates: string[] = [];
  for (let n = 0; n < 10000; n++) candidates.push(String(n).padStart(4, '0'));
  // B2-003: Fisher-Yates so we don't hand out PINs in ascending order — was Math.random(),
  // which is not a CSPRNG and shouldn't drive anything that ends up as an issued credential,
  // even a shuffle. secureRandomBytes is the same rejection-sampled source the rest of the
  // product's generated codes now use (see packages/utils/src/uuid.ts).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.sort((a, b) => Number(weak(a)) - Number(weak(b)));

  for (const pin of candidates) {
    const fp = pinFingerprint(pin, restaurantId);
    if (!taken.has(fp)) return pin;
  }
  throw new Error('No PIN available: every 4-digit PIN is already assigned in this restaurant.');
}
