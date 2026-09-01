import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../shared/database/src/db';
import { OrderRepository } from '../shared/database/src/repositories';

describe('LAN Sync Bridge & Multi-Machine Pairing Engine', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('should get default sync server URL when none configured in localStorage', () => {
    const url = db.getSyncServerUrl();
    expect(url).toBeDefined();
    expect(url).toContain('5178');
  });

  it('should set and normalize custom Host Server IP from Admin on different machine', () => {
    const customHost = 'http://192.168.1.100:5178/';
    db.setSyncServerUrl(customHost);

    const activeUrl = db.getSyncServerUrl();
    expect(activeUrl).toBe('http://192.168.1.100:5178');
  });

  it('should support testing sync server ping and connection gracefully', async () => {
    // Testing unroutable server IP returns error without throwing unhandled exceptions
    const res = await db.testSyncServer('http://192.0.2.1:5178');
    expect(res).toBeDefined();
    expect(res.success).toBe(false);
  });

  it('should persist orders created locally and queue them for LAN sync push', async () => {
    const newOrder = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'item-1',
          orderId: 'temp',
          menuItemId: db.menuItems[0].id,
          name: db.menuItems[0].name,
          sku: db.menuItems[0].sku,
          unitPrice: 200,
          quantity: 2,
          totalPrice: 400,
          modifiers: []
        }
      ],
      subtotal: 400,
      taxAmount: 20,
      discountAmount: 0,
      totalAmount: 420,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    expect(newOrder).toBeDefined();
    expect(db.orders.some((o) => o.id === newOrder.id)).toBe(true);

    // Force sync call returns boolean safely
    const syncRes = await db.forceSyncNow();
    expect(typeof syncRes).toBe('boolean');
  });
});
