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
