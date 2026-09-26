import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class QrBusyException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ statusCode: 503, code: 'BUSY', message: 'The restaurant is very busy right now. Please try again in a moment.', retryAfterSeconds }, 503);
  }
}

/** Database errors that a second attempt can fix: serialisation failure, deadlock, a write conflict, a pool that was briefly full. */
export function isTransientDbError(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string }; message?: string } | null;
  if (!err) return false;
  if (err.code === 'P2034' || err.code === 'P2024') return true;
  const pg = err.meta?.code ?? (typeof err.message === 'string' ? /\b(40001|40P01)\b/.exec(err.message)?.[1] : undefined);
  return pg === '40001' || pg === '40P01';
}

export async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 3, onRetry?: () => void): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransientDbError(e)) throw e;
      onRetry?.();
      await new Promise((r) => setTimeout(r, 15 * i + Math.random() * 60)); // small, jittered, so colliding orders do not collide again in lock-step
    }
  }
}

/**
 * Backpressure for order placement. Only so many orders are written at once per API instance (the database connection
 * pool is the real limit); the rest wait briefly in line, and past that wait they are told to retry with a 503 instead of
 * timing out deep inside the database. Retrying is safe: every order carries an idempotency key.
 */
@Injectable()
export class QrAdmission {
  private active = 0;
  private waiting: Array<() => void> = [];
  readonly stats = { admitted: 0, queued: 0, rejected: 0, retries: 0, peakActive: 0 };
  private readonly max: number;
  private readonly maxWaitMs: number;

  constructor(config: ConfigService) {
    const n = (k: string, d: number) => { const v = Number(config.get<string>(k)); return Number.isFinite(v) && v > 0 ? v : d; };
    this.max = n('QR_MAX_CONCURRENT_ORDERS', 32);
    this.maxWaitMs = n('QR_ORDER_QUEUE_WAIT_MS', 4000);
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
        reject(new QrBusyException(2));
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
