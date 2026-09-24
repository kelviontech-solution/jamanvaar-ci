/**
 * Mirrors packages/utils/src/india_compliance.ts's isValidIndianPhone/normalizeIndianPhone
 * exactly, the same way common/validation/gstin.ts mirrors that package's GSTIN/FSSAI
 * checks — cloud/api and packages/utils are different dependency trees, kept in sync by
 * definition (a stable, well-known number format), not by import.
 */
const PHONE_RE = /^(\+?91[\s-]?)?[6-9][0-9]{9}$/;

export function isValidIndianPhone(value: string): boolean {
  return PHONE_RE.test(value.trim().replace(/[\s()-]/g, ''));
}

/** Strips a +91/91/0 prefix and all non-digits, leaving the bare 10-digit number. */
export function normalizeIndianPhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
