import { describe, it, expect, beforeEach } from 'vitest';
import { db, KOTRepository, OrderRepository } from '@jamanvaar/database';

describe('POS KOT & Kitchen Station Routing Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('generates sequential KOT records routed by kitchen station', () => {
    const kots = KOTRepository.generateKOT({
      orderId: 'ord-test-101',
      orderNumber: 'JV-2026-0001',
      tokenNumber: '108',
      tableNumber: '12',
      orderType: 'DINE_IN',
      cashierName: 'Amit Dave',
      items: [
        {
          id: 'ki-1',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka (Tandoori)',
          quantity: 2,
          modifiers: [],
          kitchenStation: 'Tandoor',
          status: 'PREPARING'
        },
        {
          id: 'ki-2',
          menuItemId: 'item-dm',
          name: 'Dal Makhani',
          quantity: 1,
          modifiers: [],
          kitchenStation: 'Main Kitchen',
          status: 'PREPARING'
        },
        {
          id: 'ki-3',
          menuItemId: 'item-cc',
          name: 'Cold Coffee',
          quantity: 2,
          modifiers: [],
          kitchenStation: 'Bar',
          status: 'PREPARING'
        }
      ]
    });

    expect(kots.length).toBe(3); // 1 for Tandoor, 1 for Main Kitchen, 1 for Bar
    expect(kots.map((k) => k.station)).toContain('Tandoor');
    expect(kots.map((k) => k.station)).toContain('Main Kitchen');
    expect(kots.map((k) => k.station)).toContain('Bar');
    expect(kots[0].kotNumber).toContain('KOT-');
  });

  it('updates KOT status to READY and SERVED', () => {
    const [kot] = KOTRepository.generateKOT({
      orderId: 'ord-test-102',
      orderNumber: 'JV-2026-0002',
      tokenNumber: '109',
      orderType: 'TAKEAWAY',
      cashierName: 'Amit Dave',
      items: [
        {
          id: 'ki-4',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka',
          quantity: 1,
          modifiers: [],
          kitchenStation: 'Main Kitchen',
          status: 'PREPARING'
        }
      ]
    });

    const readyKot = KOTRepository.updateKOTStatus(kot.id, 'READY');
    expect(readyKot?.status).toBe('READY');

    const servedKot = KOTRepository.updateKOTStatus(kot.id, 'SERVED');
    expect(servedKot?.status).toBe('SERVED');
  });
});
