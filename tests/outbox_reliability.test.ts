import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { SyncOutboxEngine, OrderSyncTransport, OrderSyncPushEvent } from '../packages/sync/src/outbox';
import { MAX_ATTEMPTS_BEFORE_DEAD_LETTER } from '../packages/sync/src/sync_protocol';
import { db } from '../packages/database/src/db';
import { Order } from '../packages/types/src';

function makeOrder(id: string): Order {
  return {
    id, orderNumber: id, tokenNumber: '1', restaurantId: 'rest-1', outletId: 'out-1', kioskId: 'KIOSK-01', sessionId: 's',
    idempotencyKey: `idem-${id}`, orderType: 'TAKEAWAY', items: [], subtotal: 100, discountAmount: 0, cgstAmount: 2.5,
    sgstAmount: 2.5, taxAmount: 5, serviceChargeAmount: 0, tipAmount: 0, roundOffAmount: 0, totalAmount: 105,
    paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'SUCCESS', orderStatus: 'CONFIRMED', estimatedWaitMinutes: 15,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: 'SAVED_LOCALLY', isSynced: false
  } as Order;
}

function transport(handler: (events: OrderSyncPushEvent[]) => 'ok' | 'error' | 'throw'): OrderSyncTransport & { calls: OrderSyncPushEvent[][] } {
  const calls: OrderSyncPushEvent[][] = [];
  return {
    calls,
    async push(events) {
      calls.push(events);
      const outcome = handler(events);
      if (outcome === 'throw') throw new Error('network down');
      return {
        results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: outcome, error: outcome === 'error' ? 'boom' : undefined })),
        serverTime: new Date().toISOString()
      };
    },
    async pull() {
      return { orders: [], serverTime: new Date().toISOString() };
    }
  };
}

describe('SyncOutboxEngine reliability', () => {
  beforeEach(() => {
    db.orders.length = 0;
    db.syncEvents.length = 0;
  });
  afterEach(() => SyncOutboxEngine.configureTransport(null));

  it('sends the exact partial refund in paise instead of reversing the whole sale', async () => {
    const order = makeOrder('partial-sync');
    order.orderStatus = 'REFUNDED';order.refundAmount = 30.25;
    db.orders.push(order);
    const t = transport(() => 'ok');SyncOutboxEngine.configureTransport(t);
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(t.calls[0][0].meta?.refundAmountPaise).toBe(3025);
    expect(t.calls[0][0].totalAmount).toBe(10500);
  });

  it('every pushed order carries a stable eventId that changes only when the order changes', async () => {
    const order = makeOrder('ord-evt-1');
    db.orders.push(order);
    const t = transport(() => 'throw');
    SyncOutboxEngine.configureTransport(t);

    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    const [first, second] = [t.calls[0][0], t.calls[1][0]];
    expect(first.eventId).toBeTruthy();
    expect(second.eventId).toBe(first.eventId);

    order.updatedAt = new Date(Date.now() + 5000).toISOString();
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(t.calls[2][0].eventId).not.toBe(first.eventId);
  });

  it('a failed order is not retried again until its backoff has elapsed', async () => {
    const order = makeOrder('ord-backoff-1');
    db.orders.push(order);
    const t = transport(() => 'error');
    SyncOutboxEngine.configureTransport(t);

    await SyncOutboxEngine.processOutbox();
    expect(order.syncStatus).toBe('FAILED');
    expect(order.syncAttempts).toBe(1);
    expect(order.syncNextAttemptAt).toBeGreaterThan(Date.now());
    expect(order.syncLastError).toBe('boom');

    await SyncOutboxEngine.processOutbox();
    expect(t.calls).toHaveLength(1);

    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(t.calls).toHaveLength(2);
    expect(order.syncAttempts).toBe(2);
  });

  it('after too many failures the order is dead-lettered: kept, never retried automatically, retryable by an operator', async () => {
    const order = makeOrder('ord-dead-1');
    db.orders.push(order);
    const t = transport(() => 'error');
    SyncOutboxEngine.configureTransport(t);

    for (let i = 0; i < MAX_ATTEMPTS_BEFORE_DEAD_LETTER; i++) await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(order.syncStatus).toBe('DEAD_LETTER');
    expect(db.orders).toContain(order);

    const callsBefore = t.calls.length;
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(t.calls.length).toBe(callsBefore);
    expect(SyncOutboxEngine.getDeadLetters().map((o) => o.id)).toEqual(['ord-dead-1']);
    expect(SyncOutboxEngine.getSyncStats().deadLetterCount).toBe(1);

    SyncOutboxEngine.retryDeadLetter('ord-dead-1');
    expect(order.syncStatus).toBe('SAVED_LOCALLY');
    expect(order.syncAttempts).toBe(0);
  });

  it('a success clears the retry state', async () => {
    const order = makeOrder('ord-clear-1');
    order.syncStatus = 'FAILED';
    order.syncAttempts = 3;
    order.syncLastError = 'old';
    db.orders.push(order);
    SyncOutboxEngine.configureTransport(transport(() => 'ok'));
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect(order.syncStatus).toBe('SYNCED');
    expect(order.syncAttempts).toBe(0);
    expect(order.syncLastError).toBeUndefined();
  });

  it('a network failure backs off too, and one bad order does not stop the others', async () => {
    const bad = makeOrder('ord-mixed-bad');
    const good = makeOrder('ord-mixed-good');
    db.orders.push(bad, good);
    SyncOutboxEngine.configureTransport({
      async push(events) {
        return {
          results: events.map((e) => (e.externalOrderId === 'ord-mixed-bad'
            ? { externalOrderId: e.externalOrderId, status: 'error' as const, error: 'rejected' }
            : { externalOrderId: e.externalOrderId, status: 'ok' as const })),
          serverTime: new Date().toISOString()
        };
      },
      async pull() {
        return { orders: [], serverTime: new Date().toISOString() };
      }
    });
    await SyncOutboxEngine.processOutbox();
    expect(good.syncStatus).toBe('SYNCED');
    expect(bad.syncStatus).toBe('FAILED');
    expect(bad.syncNextAttemptAt).toBeGreaterThan(Date.now());
  });
});

describe('SyncOutboxEngine sequence cursor', () => {
  const store = new Map<string, string>();
  const original = (globalThis as any).localStorage;
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k)
    };
  });
  afterEach(() => {
    SyncOutboxEngine.configureTransport(null);
    (globalThis as any).localStorage = original;
  });

  it('pulls with the stored sequence cursor, follows hasMore, and stores the latest sequence', async () => {
    const seen: Array<string | undefined> = [];
    let page = 0;
    SyncOutboxEngine.configureTransport({
      async push() {
        return { results: [], serverTime: new Date().toISOString() };
      },
      async pull(cursor) {
        seen.push(cursor);
        page++;
        if (page === 1) return { orders: [], latestSeq: 500, hasMore: true, serverTime: 't1' };
        return { orders: [], latestSeq: 620, hasMore: false, serverTime: 't2' };
      }
    });
    await SyncOutboxEngine.catchUpFromCloud();
    expect(seen).toEqual(['seq:0', 'seq:500']);

    seen.length = 0;
    page = 5;
    await SyncOutboxEngine.catchUpFromCloud();
    expect(seen[0]).toBe('seq:620');
  });
});
