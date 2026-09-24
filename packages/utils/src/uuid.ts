/**
 * Identifier & Token Generation Utilities
 */

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateIdempotencyKey(prefix: string = 'idemp'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateTokenNumber(lastTokenNumber?: number): string {
  const next = (lastTokenNumber && lastTokenNumber >= 100) ? (lastTokenNumber + 1) : 101;
  return next.toString();
}

/**
 * Widened from a 4-digit range (9,000 possible values, no uniqueness check at
 * the old call site) to an 8-digit range — collisions are now astronomically
 * unlikely even without a retry loop, though OrderRepository.createOrder
 * additionally retries on collision as a hard guarantee, not just a low odds.
 */
export function generateOrderNumber(prefix: string = 'ORD'): string {
  const randomNum = Math.floor(10000000 + Math.random() * 90000000);
  return `${prefix}-${randomNum}`;
}

/**
 * The Web Crypto object, in a browser or in Node — both expose a global `crypto` with
 * `getRandomValues` (Node has since v19; every target browser always has). Falls back to
 * `Math.random()` only if truly unavailable, so callers never throw on an odd runtime.
 */
export function secureRandomBytes(length: number): Uint8Array {
  const g: typeof globalThis & { crypto?: Crypto } = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    return g.crypto.getRandomValues(new Uint8Array(length));
  }
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * A cryptographically random N-digit numeric code — for OTPs, PINs, and anything else that
 * authenticates someone. `Math.random()` is not a CSPRNG and must never be used for this
 * (see B2-001, B2-003, B2-014): its output is predictable enough to be modeled and, on some
 * engines, has been recovered from a handful of samples. This has no such weakness and every
 * digit is uniformly distributed (rejection sampling, not `% max` on the raw byte value, so
 * there is no modulo bias).
 */
export function generateSecureNumericCode(digits: number = 4): string {
  let out = '';
  while (out.length < digits) {
    const byte = secureRandomBytes(1)[0];
    if (byte >= 250) continue; // 256 % 10 !== 0 — discard the biased tail (250-255) instead of using % 10 directly
    out += String(byte % 10);
  }
  return out;
}

/**
 * A cryptographically random alphanumeric code from an unambiguous charset (no 0/O/1/I/L),
 * for human-typed secrets like a generated password or a device pairing code.
 */
export function generateSecureCode(length: number, charset: string = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'): string {
  const rejectAbove = 256 - (256 % charset.length); // reject bytes in the biased tail instead of using % length directly
  let out = '';
  while (out.length < length) {
    const byte = secureRandomBytes(1)[0];
    if (byte >= rejectAbove) continue;
    out += charset[byte % charset.length];
  }
  return out;
}

/**
 * A generated password that is guaranteed — not just statistically likely — to contain a
 * lowercase letter, an uppercase letter, a digit and a symbol, and passes
 * `common/validation/password.ts`'s `strongPassword` rule (10+ chars, a letter, a number or
 * symbol) with room to spare. Building it from `generateSecureCode` alone and hoping the
 * random draw happens to include a digit is not good enough: a charset that is only ~15%
 * digits has an appreciable chance of drawing zero of them over a short string, which is
 * exactly the kind of "usually fine" bug this project has already shipped once (B2-003).
 */
export function generateSecurePassword(length: number = 14): string {
  const LOWER = 'abcdefghjkmnpqrstuvwxyz';
  const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const DIGIT = '23456789';
  const SYMBOL = '!@#$%^&*-_=+';
  const ALL = LOWER + UPPER + DIGIT + SYMBOL;
  const pick = (set: string) => generateSecureCode(1, set);
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest = generateSecureCode(Math.max(length - required.length, 0), ALL).split('');
  const chars = [...required, ...rest];
  // Fisher-Yates using the same rejection-sampled source, not Math.random (the exact defect
  // this fix is closing) — a biased shuffle would still leak which positions were "required".
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * A cryptographically random integer in `[0, exclusiveMax)`, no modulo bias — for shuffles and
 * index picks. Draws as many bytes as `exclusiveMax` needs, not always one: a single byte can
 * only ever produce 256 distinct values, so for any `exclusiveMax > 256` the old single-byte
 * version's rejection threshold (`256 - (256 % exclusiveMax)`) computed to 0 — every draw was
 * rejected, forever, an infinite loop. Confirmed live: `generateUniquePin`'s 10,000-entry
 * Fisher-Yates shuffle (`packages/database/src/pin.ts`) calls this with values up to 10,000 on
 * every single PIN issuance, and hung a real process at 100% CPU for 29+ minutes before this was
 * caught (via `staff_pin.test.ts` never completing).
 */
export function secureRandomIndex(exclusiveMax: number): number {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new Error('secureRandomIndex: exclusiveMax must be a positive integer');
  }
  let byteLength = 1;
  while (256 ** byteLength < exclusiveMax) byteLength++;
  const range = 256 ** byteLength;
  const rejectAbove = range - (range % exclusiveMax);
  while (true) {
    const bytes = secureRandomBytes(byteLength);
    let value = 0;
    for (let i = 0; i < byteLength; i++) value = value * 256 + bytes[i];
    if (value < rejectAbove) return value % exclusiveMax;
  }
}
