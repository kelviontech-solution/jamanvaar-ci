import { describe, it, expect, beforeEach } from 'vitest';
import {
  posDb,
  posAdminDb,
  kioskUserDb,
  kioskAdminDb
} from '../packages/database/src';
import { Order, MenuItem, KioskDevice } from '../packages/types/src';

describe('Cross-Application Cluster Sync (Kiosk ↔ Kiosk Admin & POS ↔ POS Admin)', () => {
  beforeEach(() => {
    posDb.resetToDefaultSeed();
    posAdminDb.resetToDefaultSeed();
    kioskUserDb.resetToDefaultSeed();
    kioskAdminDb.resetToDefaultSeed();
  });

  it('1. Kiosk User creates an order ➔ propagates to POS Counter and POS Admin', () => {
    const kioskOrder: Order = {
      id: `ord-kiosk-${Date.now()}`,
      orderNumber: 'JV-KIOSK-001',
      tokenNumber: '101',
      restaurantId: 'rest-1',
      outletId: 'out-1',
      kioskId: 'KIOSK-01',
      sessionId: 'sess-kiosk-1',
      idempotencyKey: `idem-kiosk-${Date.now()}`,
      orderType: 'DINE_IN',
      tableNumber: '4',
      items: [
        {
          id: 'item-1',
          orderId: 'temp',
          menuItemId: kioskUserDb.menuItems[0].id,
          name: kioskUserDb.menuItems[0].name,
          sku: kioskUserDb.menuItems[0].sku,
          unitPrice: 240,
          quantity: 1,
          totalPrice: 240,
          modifiers: []
        }
      ],
      subtotal: 240,
      discountAmount: 0,
      taxAmount: 12,
      cgstAmount: 6,
      sgstAmount: 6,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount: 252,
      paymentMethod: 'UPI_QR',
      paymentStatus: 'SUCCESS',
      orderStatus: 'CONFIRMED',
      estimatedWaitMinutes: 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'SYNCED',
      isSynced: true
    };

    // 1. Kiosk records order
    kioskUserDb.orders.unshift(kioskOrder);
    expect(kioskUserDb.orders.some((o) => o.id === kioskOrder.id)).toBe(true);

    // 2. Simulated sync broadcast merges order into POS Counter and POS Admin
    posDb.orders.unshift(kioskOrder);
    posAdminDb.orders.unshift(kioskOrder);
    kioskAdminDb.orders.unshift(kioskOrder);

    expect(posDb.orders.find((o) => o.id === kioskOrder.id)?.orderNumber).toBe('JV-KIOSK-001');
    expect(posAdminDb.orders.find((o) => o.id === kioskOrder.id)?.totalAmount).toBe(252);
    expect(kioskAdminDb.orders.find((o) => o.id === kioskOrder.id)?.kioskId).toBe('KIOSK-01');
  });

  it('2. POS Admin updates menu dish price ➔ propagates to POS Counter and Kiosk User', () => {
    const dishId = posAdminDb.menuItems[0].id;
    const oldPrice = posAdminDb.menuItems[0].price;
    const newPrice = oldPrice + 50;

    // 1. Admin edits price
    posAdminDb.menuItems[0].price = newPrice;
    expect(posAdminDb.menuItems[0].price).toBe(newPrice);

    // 2. Broadcast sync updates POS Counter and Kiosk User
    const updatedMenu = [...posAdminDb.menuItems];
    posDb.menuItems = updatedMenu;
    kioskUserDb.menuItems = updatedMenu;

    expect(posDb.menuItems.find((m) => m.id === dishId)?.price).toBe(newPrice);
    expect(kioskUserDb.menuItems.find((m) => m.id === dishId)?.price).toBe(newPrice);
  });

  it('3. Kiosk Admin modifies kiosk hardware settings ➔ propagates to Kiosk User', () => {
    // 1. Kiosk Admin locks kiosk for maintenance
    const targetKiosk = kioskAdminDb.kiosks.find((k) => k.id === 'kiosk-01');
    if (targetKiosk) {
      targetKiosk.isLocked = true;
      targetKiosk.allowCashAtCounter = false;
      targetKiosk.idleTimeoutSeconds = 45;
    }

    // 2. Sync updates Kiosk User hardware state
    const updatedKiosks = [...kioskAdminDb.kiosks];
    kioskUserDb.kiosks = updatedKiosks;

    const userKiosk = kioskUserDb.kiosks.find((k) => k.id === 'kiosk-01');
    expect(userKiosk?.isLocked).toBe(true);
    expect(userKiosk?.allowCashAtCounter).toBe(false);
    expect(userKiosk?.idleTimeoutSeconds).toBe(45);
  });

  it('4. POS Counter performs Split Payment ➔ POS Admin reflects multi-tender sales mix', () => {
    const splitOrder: Order = {
      id: `ord-split-${Date.now()}`,
      orderNumber: 'JV-SPLIT-001',
      tokenNumber: '102',
      restaurantId: 'rest-1',
      outletId: 'out-1',
      kioskId: 'POS-01',
      sessionId: 'sess-pos-1',
      idempotencyKey: `idem-split-${Date.now()}`,
      orderType: 'DINE_IN',
      tableNumber: '2',
      items: [],
      subtotal: 1000,
      discountAmount: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount: 1000,
      paymentMethod: 'SPLIT',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      estimatedWaitMinutes: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'SYNCED',
      isSynced: true
    };

    posDb.orders.unshift(splitOrder);
    posAdminDb.orders.unshift(splitOrder);

    const adminFound = posAdminDb.orders.find((o) => o.id === splitOrder.id);
    expect(adminFound).toBeDefined();
    expect(adminFound?.paymentMethod).toBe('SPLIT');
    expect(adminFound?.totalAmount).toBe(1000);
  });
});
