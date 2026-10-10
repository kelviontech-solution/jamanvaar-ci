import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Observable, catchError, from, mergeMap, tap, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { QrSessions } from './qr-session';
import { QrMetrics } from './qr-metrics';

export interface QrRateLimits {
  /** Every public QR request from one address. Deliberately generous: one restaurant's guests share one Wi-Fi address. */
  ipRequestsPerMinute: number;
  /** Lookups of a token that does not exist or is malformed, per address: this is what token guessing looks like. */
  ipFailedLookupsPerMinute: number;
  /** Every request naming one code, from anyone: a single table cannot legitimately generate more. */
  tokenRequestsPerMinute: number;
  /** Order submissions naming one code. */
  tokenOrdersPerMinute: number;
  /** Order submissions from one browser session. */
  sessionOrdersPerMinute: number;
  /** Status polls for one order. */
  orderStatusPerMinute: number;
}

const DEFAULTS: QrRateLimits = {
  ipRequestsPerMinute: 1200,
  ipFailedLookupsPerMinute: 30,
  tokenRequestsPerMinute: 600,
  tokenOrdersPerMinute: 60,
  sessionOrdersPerMinute: 6,
  orderStatusPerMinute: 120
};

const WINDOW_MS = 60_000;

/**
 * Abuse protection for the public QR endpoints. Limits are per address, per code, per session and per order (never
 * one blunt per-address number, which would either block a whole restaurant behind one router or let a script guess
 * tokens). Counters live in PostgreSQL (table RateCounter, one atomic upsert per request for all keys), so every API
 * instance shares the same ceilings and a restart forgets nothing. Counts are sliding over the last minute (current
 * bucket plus the still-relevant share of the previous one).
 * If the counter store itself is unreachable the request is let through (the request needs the database anyway).
 */
@Injectable()
export class QrRateLimiter {
  private readonly log = new Logger('QrRateLimiter');
  private limits: QrRateLimits;
  private epoch = '';
  private sweptAt = 0;

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const n = (key: string, fallback: number) => {
      const v = Number(config.get<string>(key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    this.limits = {
      ipRequestsPerMinute: n('QR_RATE_IP_PER_MIN', DEFAULTS.ipRequestsPerMinute),
      ipFailedLookupsPerMinute: n('QR_RATE_IP_FAILED_PER_MIN', DEFAULTS.ipFailedLookupsPerMinute),
      tokenRequestsPerMinute: n('QR_RATE_TOKEN_PER_MIN', DEFAULTS.tokenRequestsPerMinute),
      tokenOrdersPerMinute: n('QR_RATE_TOKEN_ORDERS_PER_MIN', DEFAULTS.tokenOrdersPerMinute),
      sessionOrdersPerMinute: n('QR_RATE_SESSION_ORDERS_PER_MIN', DEFAULTS.sessionOrdersPerMinute),
      orderStatusPerMinute: n('QR_RATE_ORDER_STATUS_PER_MIN', DEFAULTS.orderStatusPerMinute)
    };
  }

  /**
   * Changes limits (tests, operators) and starts every counter from zero: old counters are ignored, not deleted.
   * Instances configured with the same `epoch` keep sharing counters.
   */
  configure(overrides: Partial<QrRateLimits>, epoch?: string): void {
    this.limits = { ...this.limits, ...overrides };
    this.epoch = epoch ?? Math.random().toString(36).slice(2, 8);
  }

  private key(k: string): string {
    return createHash('sha256').update(this.epoch + k).digest('base64url').slice(0, 22);
  }

  /**
   * Adds `inc` to each counter for the current one-minute bucket and returns each key's SLIDING count, in order: this bucket plus
   * the share of the previous bucket that still falls inside the last 60 seconds. One round trip. A burst straddling a bucket
   * boundary is therefore counted together instead of getting a fresh allowance.
   */
  private async bump(entries: Array<{ key: string; inc: number }>): Promise<number[]> {
    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS);
    const remaining = 1 - (now % WINDOW_MS) / WINDOW_MS; // share of the previous bucket still inside the sliding minute
    const rows = entries.map((e) => Prisma.sql`(${this.key(e.key)}, ${window}::bigint, ${e.inc}::int)`);
    const res = await this.prisma.$queryRaw<Array<{ key: string; cur: number; prev: number }>>(Prisma.sql`
      WITH up AS (
        INSERT INTO "RateCounter" AS c ("key", "windowStart", "count") VALUES ${Prisma.join(rows)}
        ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = c."count" + EXCLUDED."count"
        RETURNING "key", "count"
      )
      SELECT up."key" AS key, up."count" AS cur,
             COALESCE((SELECT p."count" FROM "RateCounter" p WHERE p."key" = up."key" AND p."windowStart" = ${window - 1}::bigint), 0) AS prev
      FROM up`);
    const byKey = new Map(res.map((r) => [r.key, Math.ceil(Number(r.cur) + Number(r.prev) * remaining)]));
    return entries.map((e) => byKey.get(this.key(e.key)) ?? 0);
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.sweptAt < 5 * WINDOW_MS) return;
    this.sweptAt = now;
    const cutoff = Math.floor(now / WINDOW_MS) - 5;
    void this.prisma.$executeRaw`DELETE FROM "RateCounter" WHERE "windowStart" < ${cutoff}::bigint`.catch(() => undefined);
  }

  private tooMany(): never {
    throw new HttpException({ statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' }, 429);
  }

  /** Throws 429 if any limit for this request is exhausted; otherwise counts the request. */
  async admit(req: { ip: string; token?: string; publicOrderId?: string; session?: string; isOrder: boolean }): Promise<void> {
    this.sweep();
    const checks: Array<{ key: string; inc: number; max: number }> = [
      { key: `ip-failed:${req.ip}`, inc: 0, max: this.limits.ipFailedLookupsPerMinute },
      { key: `ip:${req.ip}`, inc: 1, max: this.limits.ipRequestsPerMinute }
    ];
    if (req.token) checks.push({ key: `tok:${req.token}`, inc: 1, max: this.limits.tokenRequestsPerMinute });
    if (req.token && req.isOrder) checks.push({ key: `tok-order:${req.token}`, inc: 1, max: this.limits.tokenOrdersPerMinute });
    if (req.session && req.isOrder) checks.push({ key: `sess-order:${req.session}`, inc: 1, max: this.limits.sessionOrdersPerMinute });
    if (req.publicOrderId) checks.push({ key: `ord:${req.publicOrderId}`, inc: 1, max: this.limits.orderStatusPerMinute });
    let counts: number[];
    try {
      counts = await this.bump(checks);
    } catch (e) {
      this.log.warn(`rate counter store unavailable, letting the request through: ${(e as Error).message}`);
      return;
    }
    // The request that reaches a limit is the last one allowed; the next is refused. The failed-lookup counter is read only.
    if (counts.some((c, i) => (checks[i].inc === 0 ? c >= checks[i].max : c > checks[i].max))) this.tooMany();
  }

  async recordFailedLookup(ip: string): Promise<void> {
    await this.bump([{ key: `ip-failed:${ip}`, inc: 1 }]).catch(() => undefined);
  }
}

@Injectable()
export class QrRateLimitInterceptor implements NestInterceptor {
  constructor(private readonly limiter: QrRateLimiter, private readonly sessions: QrSessions, private readonly metrics: QrMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ ip?: string; url?: string; method: string; params?: Record<string, string>; query?: Record<string, string>; body?: { token?: string }; qrSession?: string; headers: Record<string, string | undefined> }>();
    const ip = (req.ip ?? 'unknown').replace(/^::ffff:/, '');
    const token = req.params?.token ?? (typeof req.query?.token === 'string' ? req.query.token : typeof req.body?.token === 'string' ? req.body.token : undefined);
    // Pictures are content-addressed (the address is a SHA-256 nobody can guess) and cached for a year: they do not count against a guest's limits.
    if (/\/images\/[a-f0-9]{64}$/.test(req.url ?? '')) return next.handle();
    // Only a session this system issued counts; a made-up one is ignored, so it cannot be used to dodge or to spoil limits.
    req.qrSession = this.sessions.verify(req.headers['x-qr-session']);
    const started = Date.now();
    const path = (req.url ?? '').split('?')[0];
    // Quotes, analytics and payment recovery are not new order submissions.
    // Counting those against six orders/session blocked ordinary cart editing.
    const isOrder = req.method === 'POST' && !!req.params?.token && /(?:\/orders\/?$|\/groups\/[^/]+\/submit\/?$)/.test(path);
    const kind = isOrder ? 'order' : /\/menu$/.test(path) ? 'menu' : 'other';
    const res = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const done = (status: number) => this.metrics.record(status, Date.now() - started, kind);
    return from(
      this.limiter.admit({
        ip,
        token,
        publicOrderId: req.params?.publicOrderId,
        session: req.qrSession,
        isOrder
      })
    ).pipe(
      mergeMap(() =>
        next.handle().pipe(
          catchError((err) => {
            const code = err instanceof HttpException ? (err.getResponse() as { code?: string })?.code : undefined;
            if (code === 'QR_NOT_FOUND' || code === 'INVALID_QR') void this.limiter.recordFailedLookup(ip);
            done(err instanceof HttpException ? err.getStatus() : 500);
            return throwError(() => err);
          }),
          tap(() => done(res.statusCode ?? 200))
        )
      ),
      catchError((err) => {
        if (err instanceof HttpException && err.getStatus() === 429) done(429);
        return throwError(() => err);
      })
    );
  }
}
