/**
 * Staff PIN hashing (BUG-005/006/009/011). PINs used to sit in `User.pinCode` as
 * plain 4-digit text, and every login screen (POS, Captain, KDS, Kiosk) compared
 * against it directly with `===`. This package is bundled into every terminal's
 * browser/Tauri renderer and has no server round-trip for a PIN check (it must
 * work fully offline), so this is a keyed, synchronous hash — not bcrypt/argon2 —
 * kept out of plaintext at rest on the terminal's local store/export/backup file.
 * It is not the product's real security boundary for a POS terminal (physical
 * possession of the device is), but "plaintext PIN sitting in the DB" is worth
 * closing regardless.
 *
 * security-audit MED-05: the original `pinv1` scheme was two rounds of 32-bit
 * FNV-1a — fast enough that all 10,000 possible 4-digit PINs could be tried against
 * a leaked hash in a fraction of a second, so a hash that leaked (e.g. via the
 * cloud entity-sync gap fixed in CRIT-01) gave the real PIN away essentially for
 * free. `pinv2` chains many thousands of rounds of the same primitive — this
 * package cannot depend on Node's `crypto` module or the async-only Web Crypto
 * `subtle` API, since it is bundled into plain browser/Tauri webview code that
 * must verify a PIN synchronously with no native crypto guaranteed available — so
 * this is deliberate, dependency-free "stretching" of a fast hash rather than a
 * true memory-hard KDF (scrypt/argon2/PBKDF2), and it deliberately does its
 * stretching with pure 32-bit integer ops (no per-round string allocation) so a
 * large round count stays fast enough for a real-time PIN entry screen — a
 * naive string-rehashing stretch was tried first and cost *seconds* per
 * check, which is not a viable login control. It raises the cost of an
 * offline guess run in this same JS engine by roughly the round count, which
 * meaningfully — but not completely — narrows the window: a 4-digit PIN's
 * keyspace is small enough, and this mixing function simple enough to
 * reimplement natively at full speed, that no synchronous, dependency-free
 * hash alone makes it fully brute-force-resistant against a determined
 * attacker. The real mitigations are (a) not letting the hash leak to an
 * untrusted device in the first place (see CRIT-01) and (b) rate-limiting/
 * locking out PIN attempts wherever one is checked (see MED-07). `hashPin`
 * always produces `pinv2`; `verifyPinHash` still accepts a previously-stored
 * `pinv1` hash so existing installs keep working without a forced PIN reset,
 * and upgrades to `pinv2` the next time that user's PIN is set.
 */

const V1_PREFIX = 'pinv1:';
const V2_PREFIX = 'pinv2:';
/**
 * ~0.2-0.3ms per hash in V8 — imperceptible on a real login (a single check), and still
 * fast enough for `generateUniquePin`'s worst case (trying up to all 10,000 4-digit
 * PINs when a restaurant has almost none left) to finish in a couple of seconds rather
 * than minutes. ~10,000x the cost of the old 2-round v1 scheme per guess.
 */
const V2_STRETCH_ROUNDS = 25_000;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One round of a numeric-only multiply-xor-shift mix — no string allocation, so it's cheap to iterate many times. */
function mix(a: number, b: number): [number, number] {
  let x = Math.imul(a ^ b, 0x2545f491) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  let y = Math.imul(b ^ x, 0x85ebca77) >>> 0;
  y = (y ^ (y >>> 13)) >>> 0;
  return [x, y];
}

function hashPinV1(pin: string, restaurantId: string): string {
  const salted = `${restaurantId}:${pin}:jamanvaar-pin`;
  const a = fnv1a(salted);
  const b = fnv1a(`${a.toString(16)}:${salted}`);
  return V1_PREFIX + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function hashPinV2(pin: string, restaurantId: string): string {
  const salted = `${restaurantId}:${pin}:jamanvaar-pin-v2`;
  let a = fnv1a(salted);
  let b = fnv1a(`${a.toString(16)}:${salted}`);
  for (let round = 0; round < V2_STRETCH_ROUNDS; round++) {
    [a, b] = mix(a ^ round, b);
  }
  return V2_PREFIX + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Keyed by restaurantId so the same 4-digit PIN hashes differently per restaurant. Always produces the current (v2) format. */
export function hashPin(pin: string, restaurantId: string): string {
  return hashPinV2(pin, restaurantId);
}

export function verifyPinHash(pin: string, restaurantId: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  // Verify against whichever format the stored hash actually is — see the file doc
  // comment on why `pinv1` is still accepted for verification (migration-on-next-set).
  if (storedHash.startsWith(V1_PREFIX)) return hashPinV1(pin, restaurantId) === storedHash;
  return hashPinV2(pin, restaurantId) === storedHash;
}

/** True for anything that still looks like an old plaintext 4-digit PIN, not one of our hashes (any version). */
export function isPlaintextPin(value: string | undefined): boolean {
  return typeof value === 'string' && !value.startsWith(V1_PREFIX) && !value.startsWith(V2_PREFIX);
}

/**
 * A random 4-digit PIN whose hash doesn't collide with `existingHashes`. Never returns
 * '0000'/repeating/sequential-looking PINs first — those are tried last, not banned,
 * so this always terminates even in a near-full 10,000-PIN restaurant.
 */
export function generateUniquePin(restaurantId: string, existingHashes: Iterable<string>): string {
  const taken = new Set(existingHashes);
  const weak = new Set(['0000', '1111', '1234', '1212', '0001']);
  const candidates: string[] = [];
  for (let n = 0; n < 10000; n++) candidates.push(String(n).padStart(4, '0'));
  // Fisher-Yates shuffle so we don't hand out PINs in ascending order.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.sort((a, b) => Number(weak.has(a)) - Number(weak.has(b)));

  for (const pin of candidates) {
    const h = hashPin(pin, restaurantId);
    if (!taken.has(h)) return pin;
  }
  throw new Error('No PIN available: every 4-digit PIN is already assigned in this restaurant.');
}
