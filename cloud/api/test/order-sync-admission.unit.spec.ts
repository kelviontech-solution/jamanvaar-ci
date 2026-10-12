import { describe, it, expect } from 'vitest';
import { OrderSyncAdmission, OrderSyncBusyException } from '../src/modules/order-sync/order-sync-admission';

describe('OrderSyncAdmission', () => {
  it('runs a bounded number of device syncs at once, queues the rest, and turns a long wait into a 503 with Retry-After', async () => {
    const cfg = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as never;
    const gate = new OrderSyncAdmission(cfg({ ORDER_SYNC_MAX_CONCURRENT: '2', ORDER_SYNC_QUEUE_WAIT_MS: '60' }));
    let running = 0;
    let peak = 0;
    const work = (ms: number) => async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, ms)); running--; return 'done'; };

    const settled = await Promise.allSettled([gate.run(work(150)), gate.run(work(150)), gate.run(work(10)), gate.run(work(10))]);

    expect(peak).toBe(2);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(2);
    const busy = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map((s) => s.reason);
    expect(busy).toHaveLength(2);
    expect(busy.every((e) => e instanceof OrderSyncBusyException && e.getStatus() === 503 && e.retryAfterSeconds === 2)).toBe(true);

    // it recovers: once the work is done the gate is open again
    expect(await gate.run(work(1))).toBe('done');
    expect(gate.stats.rejected).toBe(2);
  });

  it('without DB_POOL_SIZE configured, defaults to a conservative ceiling (not a guess at the real pool size)', () => {
    const cfg = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as never;
    const gate = new OrderSyncAdmission(cfg({}));
    expect((gate as unknown as { max: number }).max).toBe(8);
    expect((gate as unknown as { maxWaitMs: number }).maxWaitMs).toBe(4000);
  });

  it('with DB_POOL_SIZE configured, reserves most (60%) of the pool for order-sync, leaving the rest for everything else sharing it', () => {
    const cfg = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as never;
    expect((new OrderSyncAdmission(cfg({ DB_POOL_SIZE: '5' })) as unknown as { max: number }).max).toBe(3);
    expect((new OrderSyncAdmission(cfg({ DB_POOL_SIZE: '20' })) as unknown as { max: number }).max).toBe(12);
    // an explicit override always wins over the pool-derived default
    expect((new OrderSyncAdmission(cfg({ DB_POOL_SIZE: '20', ORDER_SYNC_MAX_CONCURRENT: '100' })) as unknown as { max: number }).max).toBe(100);
  });
});
