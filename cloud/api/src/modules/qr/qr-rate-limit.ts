import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, catchError, throwError } from 'rxjs';

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
  ipRequestsPerMinute: 600,
  ipFailedLookupsPerMinute: 30,
  tokenRequestsPerMinute: 300,
  tokenOrdersPerMinute: 12,
  sessionOrdersPerMinute: 6,
  orderStatusPerMinute: 120
};

const WINDOW_MS = 60_000;

/**
 * Abuse protection for the public QR endpoints. Limits are per address, per code, per session and per order (never
 * one blunt per-address number, which would either block a whole restaurant behind one router or let a script guess
 * tokens). Counters live in this process; running several API instances needs a shared store (the same note as the
 * realtime bus), and until then each instance limits on its own, which is still a real ceiling.
 */
@Injectable()
export class QrRateLimiter {
  private limits: QrRateLimits;
  private hits = new Map<string, number[]>();
  private sweptAt = Date.now();

  constructor(config: ConfigService) {
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

  configure(overrides: Partial<QrRateLimits>): void {
    this.limits = { ...this.limits, ...overrides };
    this.hits.clear();
  }

  private count(key: string, now: number): number {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    this.hits.set(key, list);
    return list.length;
  }

  private add(key: string, now: number): void {
    const list = this.hits.get(key) ?? [];
    list.push(now);
    this.hits.set(key, list);
  }

  private sweep(now: number): void {
    if (now - this.sweptAt < WINDOW_MS) return;
    this.sweptAt = now;
    for (const [k, list] of this.hits) if (list.every((t) => now - t >= WINDOW_MS)) this.hits.delete(k);
  }

  /** Throws 429 if any limit for this request is exhausted; otherwise counts the request. */
  admit(req: { ip: string; token?: string; publicOrderId?: string; session?: string; isOrder: boolean }): void {
    const now = Date.now();
    this.sweep(now);
    const over = (key: string, max: number) => {
      if (this.count(key, now) >= max) throw new HttpException({ statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' }, 429);
    };
    over(`ip-failed:${req.ip}`, this.limits.ipFailedLookupsPerMinute);
    over(`ip:${req.ip}`, this.limits.ipRequestsPerMinute);
    if (req.token) over(`tok:${req.token}`, this.limits.tokenRequestsPerMinute);
    if (req.token && req.isOrder) over(`tok-order:${req.token}`, this.limits.tokenOrdersPerMinute);
    if (req.session && req.isOrder) over(`sess-order:${req.session}`, this.limits.sessionOrdersPerMinute);
    if (req.publicOrderId) over(`ord:${req.publicOrderId}`, this.limits.orderStatusPerMinute);

    this.add(`ip:${req.ip}`, now);
    if (req.token) this.add(`tok:${req.token}`, now);
    if (req.token && req.isOrder) this.add(`tok-order:${req.token}`, now);
    if (req.session && req.isOrder) this.add(`sess-order:${req.session}`, now);
    if (req.publicOrderId) this.add(`ord:${req.publicOrderId}`, now);
  }

  recordFailedLookup(ip: string): void {
    this.add(`ip-failed:${ip}`, Date.now());
  }
}

@Injectable()
export class QrRateLimitInterceptor implements NestInterceptor {
  constructor(private readonly limiter: QrRateLimiter) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ ip?: string; method: string; params?: Record<string, string>; query?: Record<string, string>; body?: { token?: string }; headers: Record<string, string | undefined> }>();
    const ip = (req.ip ?? 'unknown').replace(/^::ffff:/, '');
    const token = req.params?.token ?? (typeof req.query?.token === 'string' ? req.query.token : typeof req.body?.token === 'string' ? req.body.token : undefined);
    this.limiter.admit({
      ip,
      token,
      publicOrderId: req.params?.publicOrderId,
      session: typeof req.headers['x-qr-session'] === 'string' ? (req.headers['x-qr-session'] as string) : undefined,
      isOrder: req.method === 'POST'
    });
    return next.handle().pipe(
      catchError((err) => {
        const code = err instanceof HttpException ? (err.getResponse() as { code?: string })?.code : undefined;
        if (code === 'QR_NOT_FOUND' || code === 'INVALID_QR') this.limiter.recordFailedLookup(ip);
        return throwError(() => err);
      })
    );
  }
}
