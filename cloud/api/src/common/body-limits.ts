import type { INestApplication } from '@nestjs/common';
import { json, raw, urlencoded } from 'express';
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
  // A ticket attachment travels as base64 (a 2 MB file is about 2.7 MB of JSON).
  { test: /^\/api\/v1\/(tenant\/)?support-tickets\/[^/]+\/attachments$/, limit: 4 * MB },
  { test: /^\/api\/v1\/orders\/sync(\/|$)/, limit: 2 * MB },
  { test: /^\/api\/v1\/(inventory|sync)\//, limit: 2 * MB }
];

export function bodyLimitFor(path: string, hasAuthorization: boolean): number {
  const p = path.split('?')[0];
  if (PUBLIC_SMALL.test(p)) return 32 * KB;
  if (hasAuthorization) for (const rule of LARGE) if (rule.test.test(p)) return rule.limit;
  return DEFAULT_BODY_LIMIT;
}

/**
 * Installs the request-body parsers the API really runs with (raw body for the payment webhook, then JSON with the per-route limit
 * above). One function for the server and the tests, so a test sees exactly the size limits a real request meets.
 */
export function installBodyParsers(app: INestApplication): void {
  // The Razorpay webhook needs the exact raw bytes for its signature check; registered first so json() skips that one path.
  app.use('/api/v1/payments/razorpay/webhook', raw({ type: '*/*', limit: '1mb' }));
  const jsonParsers = new Map<number, ReturnType<typeof json>>();
  app.use((req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const limit = bodyLimitFor(req.originalUrl ?? req.url ?? '', typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0);
    let parser = jsonParsers.get(limit);
    if (!parser) {
      parser = json({ limit });
      jsonParsers.set(limit, parser);
    }
    parser(req, res, next);
  });
  app.use(urlencoded({ extended: true, limit: '64kb' }));
}
