import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { SyncOutboxEngine, CloudSyncedOrder } from '@jamanvaar/sync';

/**
 * The device end of the QR path: an order the cloud created from a guest's scan (with the option prices, tax and menu version
 * it was priced with) is rebuilt on a POS/KDS/Captain device exactly, and a later kitchen-status update pushed from the device
 * carries the snapshot back instead of erasing it.
 */
describe('a guest QR order arrives on a device with its real prices and snapshot', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    SyncOutboxEngine.configureTransport(null);
  });

  const qrOrder = (): CloudSyncedOrder => ({
    externalOrderId: 'qr_abc123',
    orderType: 'DINE_IN',
    status: 'NEW',
    tableId: 'tbl12',
    tableLabel: '12',
    items: [
      {
        externalItemId: 'marg', name: 'Margherita Pizza', quantity: 2, unitPrice: 28900, modifiers: ['Extra Cheese'],
        modifierDetails: [{ optionName: 'Extra Cheese', priceDelta: 4000, optionId: 'extra', groupId: 'cheese', groupName: 'Cheese' }],
        snapshot: { menuVersion: 7, basePrice: 24900, taxGroupId: 'tax5', taxRateBp: 500, taxInclusive: false, lineTax: 2890 },
        kitchenStatus: 'PENDING', kitchenStation: 'Oven', lineTotal: 57800
      }
    ],
    subtotal: 57800, taxAmount: 2890, discountAmount: 0, totalAmount: 60690,
    notes: null, paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER',
    meta: { sourceType: 'QR_TABLE', tokenNumber: 'QR-1', orderNumber: 'QR-1' },
    updatedAt: new Date().toISOString()
  } as unknown as CloudSyncedOrder);

  it('rebuilds the option with its real price and group, and keeps the pricing snapshot', async () => {
    SyncOutboxEngine.configureTransport({
      push: async () => ({ results: [], serverTime: new Date().toISOString() }),
      pull: async () => ({ orders: [qrOrder()], serverTime: new Date().toISOString() })
    } as never);
    await SyncOutboxEngine.catchUpFromCloud();
    const order = db.orders.find((o) => o.id === 'qr_abc123');
    expect(order).toBeTruthy();
    const line = order!.items[0];
    expect(line.unitPrice).toBe(289);
    expect(line.modifiers[0]).toMatchObject({ optionId: 'extra', groupId: 'cheese', groupName: 'Cheese', optionName: 'Extra Cheese', priceDelta: 40 });
    expect(line.snapshot).toMatchObject({ menuVersion: 7, basePrice: 24900, taxRateBp: 500, lineTax: 2890 });
    expect(line.kitchenStation).toBe('Oven');
    expect(order!.totalAmount).toBeCloseTo(606.9, 2);
  });

  it('projects scheduled pickup into the shared order and kitchen ticket without duplicating it on refresh', async () => {
    const remote = qrOrder();
    remote.orderType = 'TAKEAWAY';
    remote.meta = {...remote.meta, pickupAt: '2026-10-11T08:00:00Z', pickupTimezone: 'Asia/Kolkata', pickupInstructions: 'Collect at reception'};
    SyncOutboxEngine.configureTransport({
      push: async () => ({results: [], serverTime: new Date().toISOString()}),
      pull: async () => ({orders: [remote], serverTime: new Date().toISOString()})
    } as never);
    await SyncOutboxEngine.catchUpFromCloud();
    const first = db.kots.filter(k => k.orderId === remote.externalOrderId);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]).toMatchObject({pickupAt: remote.meta.pickupAt, pickupTimezone: 'Asia/Kolkata'});
    expect(first[0].orderNotes).toContain('Collect at reception');
    await SyncOutboxEngine.catchUpFromCloud();
    expect(db.kots.filter(k => k.orderId === remote.externalOrderId)).toHaveLength(first.length);
    expect(db.orders.find(o => o.id === remote.externalOrderId)?.pickupAt).toBe(remote.meta.pickupAt);
  });

  it('the device pushes the order back (kitchen status changed) with the snapshot and option details intact', async () => {
    const pushed: any[] = [];
    SyncOutboxEngine.configureTransport({
      push: async (events: any[]) => { pushed.push(...events); return { results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 2 })), serverTime: new Date().toISOString() }; },
      pull: async () => ({ orders: [qrOrder()], serverTime: new Date().toISOString() })
    } as never);
    await SyncOutboxEngine.catchUpFromCloud();
    const order = db.orders.find((o) => o.id === 'qr_abc123')!;
    order.items[0].kitchenStatus = 'PREPARING';
    order.orderStatus = 'PREPARING';
    order.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox();
    const sent = pushed.find((e) => e.externalOrderId === 'qr_abc123');
    expect(sent).toBeTruthy();
    expect(sent.items[0].snapshot).toMatchObject({ menuVersion: 7, basePrice: 24900 });
    expect(sent.items[0].modifierDetails[0]).toMatchObject({ optionId: 'extra', groupId: 'cheese', priceDelta: 4000 });
  });

  it('collects only the remaining QR balance and sends its exact amount for server validation', async () => {
    const remote = qrOrder();
    remote.paymentStatus = 'PARTIALLY_PAID';
    remote.meta = { ...remote.meta, paymentAllocationSummary: { collectedPaise: 10000, outstandingPaise: 50690 } };
    const pushed: any[] = [];
    SyncOutboxEngine.configureTransport({
      push: async (events: any[]) => { pushed.push(...events); return { results: events.map(e => ({ externalOrderId: e.externalOrderId, status: 'ok' })), serverTime: new Date().toISOString() }; },
      pull: async () => ({ orders: [remote], serverTime: new Date().toISOString() })
    } as never);
    await SyncOutboxEngine.catchUpFromCloud();
    expect(() => OrderRepository.settleOrder(remote.externalOrderId, 'CASH', 606.9, 'wrong-total', 'Cashier', [{ method: 'CASH', amount: 606.9 }])).toThrow();
    const settled = OrderRepository.settleOrder(remote.externalOrderId, 'CASH', 510, 'correct-balance', 'Cashier', [{ method: 'CASH', amount: 506.9 }])!;
    expect(settled.totalAmount).toBe(606.9);
    expect(settled.changeAmount).toBe(3.1);
    expect(settled.paymentSplits?.reduce((n, p) => n + p.amount, 0)).toBe(606.9);
    await SyncOutboxEngine.processOutbox();
    expect(pushed.find(e => e.externalOrderId === remote.externalOrderId).meta.counterSettlementAmountPaise).toBe(50690);
  });
});
