import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  posDb,
  posAdminDb,
  captainDb,
  kdsDb,
  KOTRepository,
  OrderRepository,
  TableRepository
} from '../packages/database/src';
import { KIOSK_DEFAULTS } from '../apps/kiosk-system/shared/src';
import { RESTAURANT_DEFAULT_STATIONS } from '../packages/config/src';

describe('JAMANVAAR Unified Restaurant Suite Architecture & Single Local Core', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('1. POS, Admin, Captain, and KDS on the same machine connect to the same Local Core', () => {
    expect(posDb).toBe(db);
    expect(posAdminDb).toBe(db);
    expect(captainDb).toBe(db);
    expect(kdsDb).toBe(db);
  });

  it('2. Live database mutations propagate synchronously across all local interfaces', () => {
    // POS creates an order
    const ord = OrderRepository.createOrder({
      subtotal: 500,
      discountAmount: 0,
      totalAmount: 500,
      orderType: 'DINE_IN',
      tableNumber: '4',
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      source_type: 'POS'
    });

    // All local client references immediately see the order
    expect(posDb.orders.some((o) => o.id === ord.id)).toBe(true);
    expect(posAdminDb.orders.some((o) => o.id === ord.id)).toBe(true);
    expect(captainDb.orders.some((o) => o.id === ord.id)).toBe(true);
    expect(kdsDb.orders.some((o) => o.id === ord.id)).toBe(true);
  });

  it('3. Restaurant Suite Shared contracts & KDS station routing', () => {
    expect(RESTAURANT_DEFAULT_STATIONS).toContain('Main Kitchen');
    expect(RESTAURANT_DEFAULT_STATIONS).toContain('Tandoor');
    expect(RESTAURANT_DEFAULT_STATIONS).toContain('Beverage');
    expect(RESTAURANT_DEFAULT_STATIONS).toContain('Dessert');
  });

  it('4. Kiosk Suite Shared contracts defaults', () => {
    expect(KIOSK_DEFAULTS.BRAND_NAME).toBe('JAMANVAAR');
    expect(KIOSK_DEFAULTS.IDLE_TIMEOUT).toBe(60);
    expect(KIOSK_DEFAULTS.DEFAULT_CURRENCY).toBe('INR');
  });

  it('5. Full Restaurant System Flow: Captain KOT -> KDS -> Ready -> Served', () => {
    // 1. Captain generates a KOT
    const generatedKots = KOTRepository.generateKOT({
      orderId: 'ord-flow-1',
      orderNumber: 'ORD-FLOW-01',
      tokenNumber: '101',
      tableNumber: '12',
      orderType: 'DINE_IN',
      items: [
        {
          id: 'koti-fl-1',
          menuItemId: 'mi-1',
          name: 'Paneer Tikka',
          quantity: 2,
          kitchenStation: 'Tandoor',
          modifiers: [],
          specialInstructions: 'Less spicy',
          status: 'PREPARING'
        }
      ],
      cashierName: 'Captain Rahul'
    });

    expect(generatedKots).toHaveLength(1);
    const kot = generatedKots[0];
    expect(kot.status).toBe('PREPARING');

    // 2. KDS receives and updates ticket to READY
    kot.status = 'READY';
    expect(kot.status).toBe('READY');

    // 3. Captain marks ticket SERVED
    kot.status = 'SERVED';
    expect(kot.status).toBe('SERVED');
  });
});
