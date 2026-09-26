import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * A customer session is a random 96-bit id the SERVER issues and signs (HMAC). It is stateless: any API instance can verify
 * it with no lookup, and a client cannot choose, guess or forge one. It identifies a browser for analytics and per-session
 * limits only; it carries no personal data and grants no access.
 */
@Injectable()
export class QrSessions {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const base = config.get<string>('QR_SESSION_SECRET') ?? config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-only-qr-session-secret';
    this.key = createHmac('sha256', base).update('qr-session-v1').digest();
  }

  private sign(id: string): string {
    return createHmac('sha256', this.key).update(id).digest('base64url').slice(0, 22);
  }

  issue(): string {
    const id = randomBytes(12).toString('base64url');
    return `qs1.${id}.${this.sign(id)}`;
  }

  /** The session id when the header is a genuine, unaltered session issued by this system; otherwise undefined. */
  verify(header: unknown): string | undefined {
    if (typeof header !== 'string') return undefined;
    const m = /^qs1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/.exec(header);
    if (!m) return undefined;
    const expected = Buffer.from(this.sign(m[1]));
    const given = Buffer.from(m[2]);
    return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : undefined;
  }
}
