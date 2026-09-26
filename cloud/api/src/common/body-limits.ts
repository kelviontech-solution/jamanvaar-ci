/**
 * How large a request body each route may carry. One blanket 20 MB limit meant any anonymous caller could make the API buffer and
 * parse 20 MB on login, QR ordering or any other public route. Now the default is small, and the few routes that really carry
 * large payloads (menu pictures, backups) get a bigger limit only when the request presents an Authorization header (the
 * credential itself is checked later, by the guard; this just stops anonymous callers using the large limits).
 */
const KB = 1024;
const MB = 1024 * KB;

export const DEFAULT_BODY_LIMIT = 256 * KB;

const PUBLIC_SMALL: RegExp = /^\/api\/v1\/(public\/qr|qr-guest)(\/|$)/;
const LARGE: Array<{ test: RegExp; limit: number }> = [
  { test: /^\/api\/v1\/(devices\/me|tenant\/me)\/backups(\/|$)/, limit: 20 * MB },
  { test: /^\/api\/v1\/entity-sync\//, limit: 20 * MB },
  { test: /^\/api\/v1\/master-catalog\/(upload-image|import-starter-library|items|categories)/, limit: 8 * MB },
  { test: /^\/api\/v1\/tenant\/menu-sync/, limit: 4 * MB },
  { test: /^\/api\/v1\/orders\/sync(\/|$)/, limit: 2 * MB },
  { test: /^\/api\/v1\/(inventory|sync)\//, limit: 2 * MB }
];

export function bodyLimitFor(path: string, hasAuthorization: boolean): number {
  const p = path.split('?')[0];
  if (PUBLIC_SMALL.test(p)) return 32 * KB;
  if (hasAuthorization) for (const rule of LARGE) if (rule.test.test(p)) return rule.limit;
  return DEFAULT_BODY_LIMIT;
}
