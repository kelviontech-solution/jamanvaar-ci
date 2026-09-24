/**
 * B2-040: client-side mirror of `cloud/api/src/common/validation/gstin.ts`'s GSTIN/FSSAI regex
 * (BUG-054 fixed this same format check server-side, for Super Admin's create/update-restaurant
 * API — but Restaurant Admin's own "Report Branding & Legal Profile" screen saves straight to
 * local storage with no validation at all, so `GSTIN: abc` / `FSSAI: 12` reached real receipts).
 * Duplicated here rather than imported — `cloud/api` and `packages/utils` are different
 * dependency trees (same precedent as `cloud/api/src/common/csv.ts` mirroring
 * `packages/utils/src/csv.ts`) — kept in sync by definition, not by reference: these are the
 * same well-known, stable Indian regulatory number formats on both sides, not business logic
 * likely to drift.
 *
 * All four fields stay optional (a small/unregistered restaurant may genuinely have none of
 * them) — a value that IS given must be well-formed.
 */

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const FSSAI_RE = /^[0-9]{14}$/;
// 6 digits, first digit 1-9 (Indian PIN codes never start with 0).
const PINCODE_RE = /^[1-9][0-9]{5}$/;
// Accepts an optional +91/91 prefix and separators, then a 10-digit Indian mobile/landline
// number starting 6-9 (mobile) — deliberately permissive about spacing/dashes/parens, which
// real business contact numbers are typed with ("+91 79 4890 1234", "079-48901234").
const PHONE_RE = /^(\+?91[\s-]?)?[6-9][0-9]{9}$/;

export function isValidGstinFormat(value: string): boolean {
  return GSTIN_RE.test(value.trim().toUpperCase());
}

export function isValidFssaiFormat(value: string): boolean {
  return FSSAI_RE.test(value.trim());
}

export function isValidIndianPincode(value: string): boolean {
  return PINCODE_RE.test(value.trim());
}

export function isValidIndianPhone(value: string): boolean {
  return PHONE_RE.test(value.trim().replace(/[\s()-]/g, ''));
}

/**
 * B2-043: `+91 92222 22223` and `9222222223` are the same guest, but were stored verbatim —
 * matching by exact string meant they became two different customer records (two different
 * loyalty balances, two different kiosk logins for what should be one phone number, per B2-001).
 * Strips a leading `+91`/`91` country code and all non-digit characters, leaving the bare
 * 10-digit number every phone in the system should be keyed and matched by. Returns the input
 * trimmed of non-digits as-is if it isn't a recognisable 10-digit Indian number (e.g. still
 * mid-typing, or genuinely not a phone number) — callers that need to know whether it's valid
 * should check `isValidIndianPhone` separately.
 */
export function normalizeIndianPhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
