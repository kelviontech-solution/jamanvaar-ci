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
 */

const HASH_PREFIX = 'pinv1:';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Keyed by restaurantId so the same 4-digit PIN hashes differently per restaurant. */
export function hashPin(pin: string, restaurantId: string): string {
  // Two independent rounds over a salted string, folded into one 64-bit-ish hex value —
  // enough spread that the 10,000 possible 4-digit PINs don't produce colliding-looking output.
  const salted = `${restaurantId}:${pin}:jamanvaar-pin`;
  const a = fnv1a(salted);
  const b = fnv1a(`${a.toString(16)}:${salted}`);
  return HASH_PREFIX + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function verifyPinHash(pin: string, restaurantId: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  return hashPin(pin, restaurantId) === storedHash;
}

/** True for anything that still looks like an old plaintext 4-digit PIN, not one of our hashes. */
export function isPlaintextPin(value: string | undefined): boolean {
  return typeof value === 'string' && !value.startsWith(HASH_PREFIX);
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
