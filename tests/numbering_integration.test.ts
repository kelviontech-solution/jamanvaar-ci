import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NumberAllocator } from '../packages/database/src/number_allocator';
import { OrderRepository, KOTRepository } from '../packages/database/src/repositories';
import { SyncOutboxEngine, OrderSyncTransport } from '../packages/sync/src/outbox';
import { db } from '../packages/database/src/db';

const todayIst = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}${g('month')}${g('day')}`;
};

const item = () => ({
  id: `oi-${Math.random()}`, menuItemId: 'm1', name: 'Tea', quantity: 1, unitPrice: 100, totalPrice: 100,
  modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen'
});

describe('numbering is wired into order and KOT creation', () => {
  beforeEach(() => {
    NumberAllocator.reset(null);
  });
  afterEach(() => NumberAllocator.reset(null));

  it('an activated device numbers orders and KOTs from its leased blocks', () => {
    NumberAllocator.configure({ deviceCode: 'DAB12C', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: todayIst(), start: 7, count: 5 });
    NumberAllocator.addLease({ kind: 'KOT', prefix: 'AHD', businessDate: todayIst(), start: 3, count: 5 });

    const order = OrderRepository.createOrder({
      items: [item()] as never, subtotal: 100, orderType: 'TAKEAWAY', totalAmount: 105, idempotencyKey: `num-${Date.now()}`
    } as never);
    expect(order.orderNumber).toBe(`AHD-${todayIst()}-007`);

    const [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, orderType: 'TAKEAWAY',
      items: [item()] as never, cashierName: 'c'
    } as never);
    expect(kot.kotNumber).toBe(`AHD-${todayIst()}-003`);
  });

  it('an unconfigured device keeps the legacy formats', () => {
    const [kot] = KOTRepository.generateKOT({
      orderId: 'legacy-1', orderNumber: 'X', tokenNumber: '1', orderType: 'TAKEAWAY', items: [item()] as never, cashierName: 'c'
    } as never);
    expect(kot.kotNumber).toMatch(/^KOT-\d+$/);
  });
});

describe('the outbox leases number blocks while online', () => {
  afterEach(() => {
    SyncOutboxEngine.configureTransport(null);
    NumberAllocator.reset(null);
    db.orders.length = 0;
  });

  it('leases ORDER and KOT blocks on sync, configures the allocator from the server prefix, and tolerates an offline refill failure', async () => {
    NumberAllocator.reset(null);
    const requested: string[] = [];
    let fail = false;
    const transport: OrderSyncTransport = {
      async push() { return { results: [], serverTime: 't' }; },
      async pull() { return { orders: [], serverTime: 't' }; },
      deviceId: () => 'abcdef12-0000-0000-0000-000000000000',
      async leaseNumbers(kind, count) {
        requested.push(kind);
        if (fail) throw new Error('offline');
        return { kind, prefix: 'SUR', businessDate: todayIst(), start: 1, count };
      }
    };
    SyncOutboxEngine.configureTransport(transport);
    await SyncOutboxEngine.processOutbox();
    expect(requested).toEqual(['ORDER', 'KOT']);
    expect(NumberAllocator.next('ORDER')).toBe(`SUR-${todayIst()}-001`);

    fail = true;
    for (let i = 0; i < 99; i++) NumberAllocator.next("ORDER");
    await expect(SyncOutboxEngine.processOutbox()).resolves.toBeTruthy();
    expect(NumberAllocator.next('ORDER')).toMatch(/^SUR-\d{8}-DABCDEF-001$/);
  });
});
