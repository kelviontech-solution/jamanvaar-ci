import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, QrOrderingRepository, LicenseRepository } from '@jamanvaar/database';
import type { QrOrderingSettings } from '@jamanvaar/types';

/**
 * The QR ordering rules were all editable in the Restaurant Admin settings tab,
 * but nothing acted on several of them -- a restaurant could switch repeat
 * ordering off, or require waiter approval, and guests carried on regardless.
 * These cover the enforcement, which lives in the shared order engine so every
 * ordering channel gets it rather than one screen.
 */

function settings(): QrOrderingSettings {
  return QrOrderingRepository.getSettings();
}

function orderOneDish(tableNumber = '12') {
  const { qrToken } = QrOrderingRepository.generateTableQr(tableNumber);
  const dish = db.menuItems[0];
  dish.isAvailable = true;
  return QrOrderingRepository.createCustomerQrOrder({
    tableNumber,
    token: qrToken,
    items: [{ menuItemId: dish.id, quantity: 1 }]
  });
}

function releaseTable(tableNumber: string) {
  const tbl = db.tables.find((t) => t.tableNumber === tableNumber);
  if (tbl) {
    tbl.qrStatus = 'ACTIVE';
    tbl.status = 'AVAILABLE';
    tbl.currentOrderId = undefined;
  }
  // Close out any live QR order left on the table by a previous case.
  db.orders
    .filter(
      (o) =>
        (o.source_type === 'QR_TABLE' || o.orderType === 'QR_TABLE') && o.tableNumber === tableNumber
    )
    .forEach((o) => {
      o.orderStatus = 'COMPLETED';
    });
}

describe('QR ordering settings are actually enforced', () => {
  let original: QrOrderingSettings;

  beforeEach(() => {
    LicenseRepository.activatePlan('PRO');
    delete (db.license as { platformQrControl?: unknown }).platformQrControl;
    original = { ...settings() };
    releaseTable('12');
  });

  afterEach(() => {
    QrOrderingRepository.updateSettings(original);
  });

  describe('repeat ordering', () => {
    it('blocks a second order while the table has one in progress, when repeat ordering is off', () => {
      QrOrderingRepository.updateSettings({ allowRepeatOrdering: false });

      const first = orderOneDish('12');
      expect(first.orderStatus).toBe('NEW');

      expect(() => orderOneDish('12')).toThrow(/already has an order in progress/);
    });

    it('allows the next order once the previous one is closed', () => {
      QrOrderingRepository.updateSettings({ allowRepeatOrdering: false });

      const first = orderOneDish('12');
      QrOrderingRepository.updateOrderStatus(first.id, 'COMPLETED', 'POS Cashier');

      expect(() => orderOneDish('12')).not.toThrow();
    });

    it('permits repeat orders by default', () => {
      QrOrderingRepository.updateSettings({ allowRepeatOrdering: true });

      orderOneDish('12');
      expect(() => orderOneDish('12')).not.toThrow();
    });
  });

  describe('order value limits', () => {
    it('rejects an order below the configured minimum, using the total the engine computed', () => {
      QrOrderingRepository.updateSettings({ minOrderValue: 1_000_000 });

      expect(() => orderOneDish('12')).toThrow(/Minimum order value/);
    });

    it('rejects an order above the configured maximum', () => {
      QrOrderingRepository.updateSettings({ minOrderValue: 0, maxOrderValue: 1 });

      expect(() => orderOneDish('12')).toThrow(/exceeds the 1 limit/);
    });

    it('applies no minimum when it is set to zero', () => {
      QrOrderingRepository.updateSettings({ minOrderValue: 0, maxOrderValue: 100000 });

      expect(() => orderOneDish('12')).not.toThrow();
    });
  });

  describe('waiter approval gate', () => {
    it('withholds the kitchen ticket until staff accepts the order', () => {
      QrOrderingRepository.updateSettings({ requireWaiterApproval: true });

      const order = orderOneDish('12');

      // The order exists and is visible to POS...
      expect(db.orders.some((o) => o.id === order.id)).toBe(true);
      // ...but the kitchen has not been fired.
      expect(db.kots.filter((k) => k.orderId === order.id).length).toBe(0);
      expect(order.timeline?.some((t) => t.title === 'Awaiting Staff Approval')).toBe(true);

      // Staff accepts -> the KOT is released.
      QrOrderingRepository.updateOrderStatus(order.id, 'ACCEPTED', 'POS Cashier');
      const kots = db.kots.filter((k) => k.orderId === order.id);
      expect(kots.length).toBe(1);
      expect(kots[0].tableNumber).toBe('12');
    });

    it('does not double-fire the kitchen when an order is advanced twice', () => {
      QrOrderingRepository.updateSettings({ requireWaiterApproval: true });

      const order = orderOneDish('12');
      QrOrderingRepository.updateOrderStatus(order.id, 'ACCEPTED', 'POS Cashier');
      QrOrderingRepository.updateOrderStatus(order.id, 'PREPARING', 'POS Cashier');

      expect(db.kots.filter((k) => k.orderId === order.id).length).toBe(1);
    });

    it('also holds the ticket when auto-send-to-kitchen is switched off', () => {
      QrOrderingRepository.updateSettings({ requireWaiterApproval: false, autoSendToKitchen: false });

      const order = orderOneDish('12');
      expect(db.kots.filter((k) => k.orderId === order.id).length).toBe(0);
    });

    it('sends straight to the kitchen under the default settings', () => {
      QrOrderingRepository.updateSettings({ requireWaiterApproval: false, autoSendToKitchen: true });

      const order = orderOneDish('12');
      expect(db.kots.filter((k) => k.orderId === order.id).length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('QR analytics report absence honestly', () => {
  it('names no top dish or top table when nothing has been sold in scope', () => {
    LicenseRepository.activatePlan('PRO');

    // YESTERDAY is empty in a freshly seeded db - the seed writes today's orders.
    const stats = QrOrderingRepository.getQrStats('YESTERDAY');

    expect(stats.totalOrders).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    // Previously these returned the hardcoded 'Table 12' and
    // 'Paneer Tikka (Tandoori)' - a winner invented out of an empty system.
    expect(stats.topTable).toBeNull();
    expect(stats.topDish).toBeNull();
  });

  it('reports a real winner once there is real data', () => {
    LicenseRepository.activatePlan('PRO');
    releaseTable('12');
    QrOrderingRepository.updateSettings({ minOrderValue: 0, maxOrderValue: 100000 });

    const order = orderOneDish('12');
    const stats = QrOrderingRepository.getQrStats('TODAY');

    expect(stats.totalOrders).toBeGreaterThan(0);
    expect(stats.topTable).toContain('Table');
    expect(stats.topDish).toContain(order.items[0].name);
  });

  it('gives no last-order time for a table that has never taken an order at all', () => {
    // A table may legitimately carry a lastOrderTime from a POS or captain
    // order, so only a table with no order history at all should read null.
    const fresh = db.tables.find((t) => t.tableNumber !== '12');
    expect(fresh).toBeDefined();
    const previous = fresh!.lastOrderTime;
    fresh!.lastOrderTime = undefined;

    try {
      const stats = QrOrderingRepository.getQrStats('YESTERDAY');
      const row = stats.tableBreakdown.find((t) => t.tableNumber === fresh!.tableNumber);

      expect(row).toBeDefined();
      expect(row!.orderCount).toBe(0);
      // Used to read a flat '12:00 PM', which looks like a measurement.
      expect(row!.lastOrder).toBeNull();
    } finally {
      fresh!.lastOrderTime = previous;
    }
  });
});
