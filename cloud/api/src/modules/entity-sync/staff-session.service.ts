import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type StaffTokenKind = 'session' | 'approval';
export interface RefundApprovalScope { action: 'REFUND'; paymentId: string; amountPaise: number; idempotencyKey: string }

export interface StaffClaims {
  v: 1;
  kind: StaffTokenKind;
  rid: string; // restaurant
  did: string; // terminal (device) it was issued to
  sid: string; // staff member
  role: string;
  name: string;
  iat: number; // ms
  exp: number; // ms
  scope?: RefundApprovalScope;
}

export const SESSION_TTL_MS = 12 * 60 * 60_000;
export const APPROVAL_TTL_MS = 15 * 60_000;
/** Terminals work offline and push later, so a token is judged at the time the action happened, with a little clock slack. */
const SKEW_MS = 5 * 60_000;

/**
 * Proof of WHO is at a terminal. A staff member signs in with their PIN; the server checks it and hands the terminal a signed,
 * short-lived token naming that person and role. The terminal stamps the token onto what it does (orders, voids, refunds), and the
 * server reads the role from the token instead of believing a name the terminal typed. Tokens are bound to the restaurant and the
 * terminal, use a key derived from (but different to) the API secret so they can never pass as an access token, and cannot be
 * forged or altered by the terminal.
 */
@Injectable()
export class StaffSessionService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('jamanvaar:staff-session:v1').digest();
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key()).update(body).digest('base64url');
  }

  issue(kind: StaffTokenKind, who: { restaurantId: string; deviceId: string; staffId: string; role: string; name: string; scope?: RefundApprovalScope }, now = Date.now()): { token: string; expiresAt: string } {
    const claims: StaffClaims = { v: 1, kind, rid: who.restaurantId, did: who.deviceId, sid: who.staffId, role: who.role, name: who.name, iat: now, exp: now + (kind === 'session' ? SESSION_TTL_MS : who.scope ? 2 * 60_000 : APPROVAL_TTL_MS), ...(kind === 'approval' && who.scope ? { scope: who.scope } : {}) };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(claims.exp).toISOString() };
  }

  /**
   * The claims when the token is genuine, belongs to this restaurant and terminal, is of the expected kind, and covers the moment `at`
   * (defaults to now). Otherwise null; never throws.
   */
  verify(token: unknown, restaurantId: string, deviceId: string, kind: StaffTokenKind, at = Date.now()): StaffClaims | null {
    if (typeof token !== 'string' || token.length > 1200) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(this.sign(body));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StaffClaims;
      if (c.v !== 1 || c.kind !== kind || c.rid !== restaurantId || c.did !== deviceId) return null;
      if (typeof c.sid !== 'string' || typeof c.role !== 'string') return null;
      if (at < c.iat - SKEW_MS || at > c.exp + SKEW_MS) return null;
      return c;
    } catch {
      return null;
    }
  }
}
