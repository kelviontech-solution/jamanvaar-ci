import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withTransientRetry } from '../qr/qr-resilience';

export class OrderSyncBusyException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ statusCode: 503, code: 'BUSY', message: 'The server is handling a lot of order syncs right now. Please retry in a moment.', retryAfterSeconds }, 503);
  }
}

/**
 * Backpressure for device order-sync pushes (POS, Kiosk, Captain, KDS, Restaurant/POS Admin) — the
 * same shape as QrAdmission (qr-resilience.ts) for QR ordering, so the shared device-write path gets
 * the same protection the QR path already had. Only so many pushEvents transactions run at once per
 * API instance (the database connection pool is the real limit); the rest wait briefly in line, and
 * past that wait they are told to retry with a 503 instead of queuing indefinitely or exhausting the
 * pool. Retrying is always safe: every order event is upserted by (restaurantId, externalOrderId), so
 * a retried push never double-applies.
 *
 * The default concurrency ceiling is deliberately lower than QrAdmission's (32), and tied to
 * DB_POOL_SIZE, not a flat constant. QR's order-write transactions are independent and brief; a
 * pushEvents transaction takes a per-restaurant advisory lock (order-sync.service.ts) and holds its
 * pooled connection for the *entire* time it waits in that lock queue, not just its own work. Measured
 * directly (test/order-sync-load.e2e.spec.ts, 50 concurrent pushes from 10 POS terminals to one
 * restaurant, local dev database): with a flat high cap, admitted-but-queued transactions alone
 * exhausted the connection pool and 2/50 pushes failed with a raw "can't reach database" error
 * instead of this gate's clean 503 — the exact failure this class exists to prevent. Reserving most
 * of the pool (default 60%) for order-sync and leaving the rest for everything else sharing the same
 * pool (QR, dashboards, the device-auth guard's own lookups) closed that gap in the same measurement.
 */
@Injectable()
export class OrderSyncAdmission {
  private active = 0;
  private waiting: Array<() => void> = [];
  readonly stats = { admitted: 0, queued: 0, rejected: 0, retries: 0, peakActive: 0 };
  private readonly max: number;
  private readonly maxWaitMs: number;

  constructor(config: ConfigService) {
    const n = (k: string, d: number) => { const v = Number(config.get<string>(k)); return Number.isFinite(v) && v > 0 ? v : d; };
    const poolSize = n('DB_POOL_SIZE', 0);
    // Below the explicit floor: with no DB_POOL_SIZE configured, Prisma falls back to its own
    // (larger, CPU-based) default pool, but this path's lock-holding behaviour still means "admit
    // many" is unsafe — 8 is a conservative default, not a guess at the real pool size.
    const defaultMax = poolSize > 0 ? Math.max(2, Math.floor(poolSize * 0.6)) : 8;
    this.max = n('ORDER_SYNC_MAX_CONCURRENT', defaultMax);
    this.maxWaitMs = n('ORDER_SYNC_QUEUE_WAIT_MS', 4000);
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      this.stats.peakActive = Math.max(this.stats.peakActive, this.active);
      return Promise.resolve();
    }
    this.stats.queued++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = this.waiting.filter((w) => w !== grant);
        this.stats.rejected++;
        reject(new OrderSyncBusyException(2));
      }, this.maxWaitMs);
      const grant = () => { clearTimeout(timer); this.active++; this.stats.peakActive = Math.max(this.stats.peakActive, this.active); resolve(); };
      this.waiting.push(grant);
    });
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    this.stats.admitted++;
    try {
      return await withTransientRetry(fn, 3, () => { this.stats.retries++; });
    } finally {
      this.release();
    }
  }
}
