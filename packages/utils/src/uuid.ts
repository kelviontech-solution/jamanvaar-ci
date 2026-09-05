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

export function generateOrderNumber(prefix: string = 'ORD'): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomNum}`;
}
