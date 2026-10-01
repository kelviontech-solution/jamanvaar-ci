import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Service-to-service auth for the Jamanvaar ↔ WhatsApp connector (see
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md and
 * WHATSAPP_ORDERING_PLAN_AND_PROMPT.md §6/§11 in the same repo). This is NOT a login —
 * `product/whatsapp`'s backend calls these endpoints directly, so there is no user
 * session to check. Both sides share one secret (`JAMANVAAR_SERVICE_SECRET`, an
 * environment variable on both servers, never in a database or a client), and every
 * request is signed with it: `HMAC-SHA256(secret, METHOD\nPATH\nTIMESTAMP\nSHA256(BODY))`,
 * sent as `X-Signature` and `X-Timestamp` headers. A request older than 5 minutes, or
 * whose exact signature has already been seen, is refused — the same replay-protection
 * shape as everywhere else a shared secret authenticates a machine in this codebase.
 *
 * Deliberately separate from every other guard in this folder: those all authenticate a
 * *person* or a *device* against this database. This authenticates *another server*, and
 * has no database lookup at all in the common case — a forged signature is rejected
 * before any query runs.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const REPLAY_TTL_MS = MAX_CLOCK_SKEW_MS + 60_000; // outlive the timestamp window itself
const seenSignatures = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - REPLAY_TTL_MS;
  for (const [sig, seenAt] of seenSignatures) if (seenAt < cutoff) seenSignatures.delete(sig);
}, 60_000).unref?.();

function computeSignature(secret: string, method: string, path: string, timestamp: string, rawBody: string): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time compare of two equal-length hex strings; false (not a throw) on any
 *  length mismatch, since an attacker-controlled header must never distinguish "wrong
 *  length" from "wrong value" through a thrown-vs-caught timing difference either. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class ServiceSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    const secret = process.env.JAMANVAAR_SERVICE_SECRET;
    if (!secret) {
      // Fail closed, loudly, in every environment -- an unset secret must never silently
      // downgrade this guard to "accept anything with the right-shaped headers."
      throw new UnauthorizedException({ statusCode: 401, message: 'Service signing is not configured on this server', code: 'SERVICE_SECRET_UNSET' });
    }

    const signature = request.headers['x-signature'];
    const timestamp = request.headers['x-timestamp'];
    if (typeof signature !== 'string' || typeof timestamp !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Missing or malformed signature', code: 'INVALID_SIGNATURE' });
    }

    const requestTime = Number(timestamp);
    if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > MAX_CLOCK_SKEW_MS) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Request timestamp is too old or too far in the future', code: 'STALE_TIMESTAMP' });
    }

    // The FULL path, including the query string -- channels/menu's restaurantId lives
    // there, and stripping it (an earlier version of this guard did) would mean a valid
    // signature for restaurantId=A also validates unchanged for restaurantId=B, since
    // neither the query string nor an empty GET body would differ. Caught by a real e2e
    // test signing the query string while this guard silently ignored it, not by
    // inspection -- see whatsapp-channel-menu.e2e.spec.ts.
    const path = request.originalUrl ?? request.url ?? '';
    // express.json() (see body-limits.ts) has already parsed request.body by the time a
    // guard runs; re-serializing it deterministically is only safe because every route
    // behind this guard sends a flat, non-numeric-precision-sensitive JSON body (small
    // DTOs, not floats where JSON.stringify's own formatting could disagree with
    // whatever the sender serialized). If that stops being true for a future route on
    // this guard, switch that route to a raw-body-capturing middleware instead.
    const rawBody = request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(request.body ?? {});
    const expected = computeSignature(secret, request.method, path, timestamp, rawBody);

    if (!safeEqualHex(expected, signature)) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Signature does not match', code: 'INVALID_SIGNATURE' });
    }

    if (seenSignatures.has(signature)) {
      throw new UnauthorizedException({ statusCode: 401, message: 'This exact request was already processed', code: 'REPLAYED_REQUEST' });
    }
    seenSignatures.set(signature, Date.now());

    return true;
  }
}
