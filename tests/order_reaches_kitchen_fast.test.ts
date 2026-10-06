import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, StaffRepository, ServiceMessages, OrderRepository } from '@jamanvaar/database';
import { SyncOutboxEngine } from '@jamanvaar/sync';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

/**
 * A kitchen needs a ticket in about a second. The server answers in milliseconds, so the delay was the tablet waiting
 * for its own 4 second timer: the Captain never pushed after "Fire KOT" (POS did). Measured in a real Captain + KDS
 * pair: 4.1 s before, 0.4 s after. These tests keep every order-changing Captain action pushing immediately, and keep
 * the KDS beeping for a ticket that arrives from another device.
 */
describe('Captain pushes to the cloud immediately', () => {
  let pin: string;
  const store = () => useCaptainStore.getState();
  let flush: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    db.resetToDefaultSeed();
    db.users = [];
    db.orders = [];
    db.kots = [];
    ServiceMessages.resetForTests();
    pin = (await StaffRepository.createUser({ username: 'ravi', fullName: 'Ravi Waiter', roleId: 'role-captain' })).issuedPin!;
    store().logout();
    useCaptainStore.setState({ cartItems: [], selectedTable: null, selectedTableOrder: null, foodReadyItems: [], tableFilter: 'ALL_TABLES' });
    expect(await store().login(pin)).toBe(true);
    flush = vi.spyOn(SyncOutboxEngine, 'flush');
  });
  afterEach(() => flush.mockRestore());

  const seatAndOrder = () => {
    const table = db.tables[0];
    store().selectTable(table);
    store().openTable(table.tableNumber, 2);
    store().addItemToCart(db.menuItems[0], [], '', 'COURSE_1', 1);
    return table.tableNumber;
  };

  it('Fire KOT sends the order right away, not at the next timer tick', () => {
    seatAndOrder();
    flush.mockClear();
    const kots = store().sendKOT();
    expect(kots && kots.length).toBeGreaterThan(0);
    expect(flush).toHaveBeenCalled();
  });

  it('a bill request, a message to the kitchen and serving a dish each push right away', () => {
    const tableNumber = seatAndOrder();
    store().sendKOT();

    flush.mockClear();
    expect(store().requestBill(tableNumber)).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);

    flush.mockClear();
    store().sendMessage('KITCHEN', 'Please hurry', '', tableNumber);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('seating a table pushes the table state so the counter sees it occupied', () => {
    const table = db.tables[1];
    store().selectTable(table);
    flush.mockClear();
    store().openTable(table.tableNumber, 3);
    expect(flush).toHaveBeenCalled();
  });
});

describe('KDS reacts at once', () => {
  const kds = readFileSync(join(__dirname, '../apps/restaurant-system/kds/src/App.tsx'), 'utf8');

  it('plays the new-ticket sound for any ticket that appears, wherever it came from', () => {
    expect(kds).toMatch(/seenKotIds/);
    expect(kds).toMatch(/!seen\.has\(k\.id\)[\s\S]{0,200}sound\.play\('kot'\)/);
    // Once per new ticket: the same-browser mesh listener must not also beep.
    expect(kds.match(/sound\.play\('kot'\)/g)?.length).toBe(2); // new ticket + message to the kitchen
  });

  it('pushes every change (start, one dish, all dishes, served, undo) immediately', () => {
    expect(kds).toMatch(/const commit = \(\) => \{[\s\S]{0,200}SyncOutboxEngine\.flush\(\)/);
    for (const fn of ['const updateStatus', 'const setDish', 'const markAllReady', 'function recallTicket']) {
      const start = kds.indexOf(fn);
      expect(start, fn).toBeGreaterThan(-1);
      // The function ends where the next top-level declaration of the component starts.
      const rest = kds.slice(start + fn.length);
      const next = rest.search(/\n  (const|function) /);
      expect(rest.slice(0, next), fn).toMatch(/commit\(\)/);
    }
  });
});

describe('the outbox never leaves a change waiting behind a push that was already running', () => {
  it('a second flush during an in-flight push is sent as soon as the first finishes, not at the next timer tick', async () => {
    db.resetToDefaultSeed();
    db.orders = [];
    const sent: string[][] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    SyncOutboxEngine.configureTransport({
      push: async (events) => {
        sent.push(events.map((e) => `${e.externalOrderId}:${e.items.map((i) => i.kitchenStatus).join(',')}`));
        if (sent.length === 1) await gate;
        return { results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })), serverTime: new Date().toISOString() };
      },
      pull: async () => ({ orders: [], serverTime: new Date().toISOString() })
    });
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '3', subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', syncStatus: 'SAVED_LOCALLY',
      items: [{ id: 'oi-f', orderId: '', menuItemId: 'f', name: 'F', sku: 'f', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PREPARING' as const }]
    });
    SyncOutboxEngine.flush();
    await new Promise((r) => setTimeout(r, 10));
    // The cook taps again while the first push is still on its way.
    order.items[0].kitchenStatus = 'READY';
    order.updatedAt = new Date(Date.now() + 1000).toISOString();
    order.syncStatus = 'SAVED_LOCALLY';
    SyncOutboxEngine.flush();
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toHaveLength(2);
    expect(sent[1][0]).toContain('READY');
    SyncOutboxEngine.configureTransport(null);
  });
});
