import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, billsWaiting, isBillWaiting, projectTableBillState, announceBillRequests, refreshBillState, resetBillAnnouncementsForTests, billLinesOf, BILL_REQUEST_FRESH_MS } from '@jamanvaar/database';
import { SyncOutboxEngine, EntitySyncEngine } from '@jamanvaar/sync';
import type { DiningTable, Order } from '@jamanvaar/types';

const now = Date.parse('2026-10-07T10:00:00.000Z');
const requestedAt = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

const order = (patch: Partial<Order> = {}): Order =>
  ({
    id: 'ord-1',
    orderNumber: 'MAIN-20261007-001',
    tokenNumber: '101',
    tableId: 'tbl-4',
    tableNumber: 'TN4',
    captainName: 'Captain One',
    orderType: 'DINE_IN',
    orderStatus: 'PREPARING',
    paymentStatus: 'PENDING',
    paymentMethod: 'CASH_AT_COUNTER',
    items: [
      { id: 'i1', menuItemId: 'm1', name: 'Paneer Tikka', quantity: 2, unitPrice: 300, totalPrice: 600 },
      { id: 'i2', menuItemId: 'm2', name: 'Naan', quantity: 1, unitPrice: 60, totalPrice: 60 }
    ],
    subtotal: 660,
    taxAmount: 33,
    discountAmount: 0,
    totalAmount: 693,
    createdAt: requestedAt(30),
    updatedAt: requestedAt(5),
    syncStatus: 'SYNCED',
    ...patch
  }) as unknown as Order;

const table = (patch: Partial<DiningTable> = {}): DiningTable =>
  ({ id: 'tbl-4', tableNumber: 'TN4', capacity: 4, zone: 'Main Hall', floor: 1, status: 'OCCUPIED', isActive: true, currentOrderId: 'ord-1', updatedAt: requestedAt(30), ...patch }) as DiningTable;

describe('a bill request belongs to its order', () => {
  beforeEach(() => {
    db.orders = [];
    db.tables = [];
    db.notifications = [];
    resetBillAnnouncementsForTests();
  });

  describe('which orders are waiting for the counter', () => {
    it('an unpaid order with a request is waiting', () => {
      expect(isBillWaiting(order({ billRequestedAt: requestedAt(2) }))).toBe(true);
    });

    it('an order with no request is not waiting', () => {
      expect(isBillWaiting(order())).toBe(false);
    });

    it('a paid, cancelled or completed order is not waiting, even if the guest asked', () => {
      const asked = requestedAt(2);
      expect(isBillWaiting(order({ billRequestedAt: asked, paymentStatus: 'SUCCESS' }))).toBe(false);
      expect(isBillWaiting(order({ billRequestedAt: asked, orderStatus: 'CANCELLED' }))).toBe(false);
      expect(isBillWaiting(order({ billRequestedAt: asked, orderStatus: 'COMPLETED' }))).toBe(false);
    });

    it('billsWaiting lists the waiting bills oldest request first, with what they owe', () => {
      db.orders = [
        order({ id: 'late', billRequestedAt: requestedAt(1), totalAmount: 100 }),
        order({ id: 'early', tableNumber: 'TN2', billRequestedAt: requestedAt(20), totalAmount: 250 }),
        order({ id: 'none', tableNumber: 'TN9' })
      ];
      const waiting = billsWaiting();
      expect(waiting.map((o) => o.id)).toEqual(['early', 'late']);
      expect(waiting.map((o) => o.totalAmount)).toEqual([250, 100]);
    });

    it('the lines a counter prints are the quantity and name of each item', () => {
      expect(billLinesOf(order())).toBe('2× Paneer Tikka, 1× Naan');
    });
  });

  describe('the table follows its order', () => {
    it('a table whose order is waiting shows Bill Requested', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2) })];
      const t = table();
      projectTableBillState(t);
      expect(t.status).toBe('BILL_REQUESTED');
    });

    it('once the order is paid the table goes back to Occupied', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2), paymentStatus: 'SUCCESS' })];
      const t = table({ status: 'BILL_REQUESTED' });
      projectTableBillState(t);
      expect(t.status).toBe('OCCUPIED');
    });

    it('a table whose order has not arrived on this device keeps its status until it does', () => {
      db.orders = [];
      const t = table({ status: 'BILL_REQUESTED' });
      projectTableBillState(t);
      expect(t.status).toBe('BILL_REQUESTED');
    });

    it('a table with no order that still shows a bill is freed', () => {
      const t = table({ status: 'BILL_REQUESTED', currentOrderId: undefined });
      projectTableBillState(t);
      expect(t.status).toBe('AVAILABLE');
    });

    it('a table that is simply occupied is left alone', () => {
      db.orders = [order()];
      const t = table();
      projectTableBillState(t);
      expect(t.status).toBe('OCCUPIED');
    });
  });

  describe('the counter is told once per request', () => {
    it('one request raises one notification, however many times the orders are looked at', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2) })];
      expect(announceBillRequests(now)).toBe(1);
      expect(announceBillRequests(now)).toBe(0);
      expect(announceBillRequests(now)).toBe(0);
      expect(db.notifications).toHaveLength(1);
      expect(db.notifications[0].title).toBe('🧾 Table TN4 · ₹693.00 to pay');
      expect(db.notifications[0].message).toBe('2× Paneer Tikka, 1× Naan — Captain One asked for the bill.');
      expect(db.notifications[0].meta).toEqual({ orderId: 'ord-1', billAmount: 693 });
    });

    it('a new request on the same order raises a new notification', () => {
      db.orders = [order({ billRequestedAt: requestedAt(20) })];
      announceBillRequests(now);
      db.orders[0].billRequestedAt = requestedAt(1);
      expect(announceBillRequests(now)).toBe(1);
      expect(db.notifications).toHaveLength(2);
    });

    it('after a restart, a request already in the notification list does not appear twice', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2) })];
      announceBillRequests(now);
      resetBillAnnouncementsForTests();
      announceBillRequests(now);
      expect(db.notifications).toHaveLength(1);
    });

    it('an old request is history, not a new call for the counter', () => {
      db.orders = [order({ billRequestedAt: new Date(now - BILL_REQUEST_FRESH_MS - 60_000).toISOString() })];
      expect(announceBillRequests(now)).toBe(0);
      expect(db.notifications).toHaveLength(0);
    });

    it('a split-by-seat request says so on the counter', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2), billSplitNote: 'Seat 1 ₹300, Seat 2 ₹393' })];
      announceBillRequests(now);
      expect(db.notifications[0].message).toContain('· split: Seat 1 ₹300, Seat 2 ₹393');
    });

    it('once the bill is paid its notification reads as settled and is no longer a call to action', () => {
      db.orders = [order({ billRequestedAt: requestedAt(2) })];
      announceBillRequests(now);
      db.orders[0].paymentStatus = 'SUCCESS';
      refreshBillState();
      expect(db.notifications[0].title).toBe('🧾 Table TN4 · ₹693.00 · settled');
      expect(db.notifications[0].isRead).toBe(true);
    });
  });

  describe('a bill request reaches another device with its order', () => {
    afterEach(() => {
      SyncOutboxEngine.configureTransport(null);
      EntitySyncEngine.configureTransport(null);
    });

    it('a pulled order carrying billRequestedAt puts the table into Bill Requested and raises one notification', async () => {
      db.tables = [table()];
      const remote: any = {
        externalOrderId: 'ord-1',
        orderType: 'DINE_IN',
        status: 'PREPARING',
        tableLabel: 'TN4',
        items: [{ externalItemId: 'i1', menuItemId: 'm1', name: 'Paneer Tikka', quantity: 2, unitPrice: 30000, lineTotal: 60000, modifiers: [], kitchenStatus: 'PENDING' }],
        subtotal: 60000,
        taxAmount: 3000,
        discountAmount: 0,
        totalAmount: 63000,
        paymentStatus: 'PENDING',
        paymentMethod: 'CASH_AT_COUNTER',
        meta: { orderNumber: 'MAIN-20261007-001', captainName: 'Captain One', billRequestedAt: requestedAt(2), billSplitNote: undefined },
        seq: 9,
        updatedAt: requestedAt(2)
      };
      const cloudNow = new Date().toISOString();
      SyncOutboxEngine.configureTransport({
        push: async () => ({ results: [], serverTime: cloudNow }),
        pull: async () => ({ orders: [remote], latestSeq: remote.seq, serverTime: cloudNow })
      });
      await SyncOutboxEngine.catchUpFromCloud();

      const pulled = db.orders.find((o) => o.id === 'ord-1');
      expect(pulled?.billRequestedAt).toBe(remote.meta.billRequestedAt);
      expect(db.tables[0].status).toBe('BILL_REQUESTED');
      expect(db.notifications.filter((n) => n.id === `notif-ord-1-${remote.meta.billRequestedAt}`)).toHaveLength(1);
    });
  });
});
