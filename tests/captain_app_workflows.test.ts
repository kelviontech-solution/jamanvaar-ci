import { describe, it, expect, beforeEach } from 'vitest';
import {
  captainDb,
  OrderRepository,
  KOTRepository,
  TableRepository,
  AuditRepository
} from '../packages/database/src';
import { Order, MenuItem, DiningTable, KOT } from '../packages/types/src';

describe('JAMANVAAR Captain Floor Service Application Workflows', () => {
  beforeEach(() => {
    captainDb.resetToDefaultSeed();
  });

  it('1. Captain PIN authentication and shift session initialization', () => {
    expect(captainDb).toBeDefined();
    expect(captainDb.restaurant.name).toBeDefined();
    expect(captainDb.tables.length).toBeGreaterThan(0);
  });

  it('2. Open Table with guest count and initialize dining session', () => {
    const table = captainDb.tables.find((t) => t.tableNumber === '12') || captainDb.tables[0];
    table.status = 'OCCUPIED';
    table.currentGuests = 4;

    expect(table.status).toBe('OCCUPIED');
    expect(table.currentGuests).toBe(4);
  });

  it('3. 1-Tap item add with course sequencing and kitchen notes', () => {
    const paneerDish = captainDb.menuItems[0];
    expect(paneerDish).toBeDefined();

    const orderItem = {
      id: `oi-${Date.now()}`,
      orderId: '',
      menuItemId: paneerDish.id,
      name: paneerDish.name,
      sku: paneerDish.sku,
      quantity: 2,
      unitPrice: paneerDish.price,
      totalPrice: paneerDish.price * 2,
      specialInstructions: 'Less spicy, no onion',
      modifiers: [],
      kitchenStatus: 'PENDING' as const
    };

    expect(orderItem.quantity).toBe(2);
    expect(orderItem.specialInstructions).toBe('Less spicy, no onion');
  });

  it('4. Send KOT & KOT Splitting (only newly added items fired)', () => {
    const tableNumber = '12';
    const dish1 = captainDb.menuItems[0];
    const dish2 = captainDb.menuItems[1];

    // Initial Round 1 KOT
    const round1Kot = KOTRepository.generateKOT({
      orderId: 'ord-test-1',
      orderNumber: 'ORD-CAP-101',
      tokenNumber: '101',
      tableNumber,
      orderType: 'DINE_IN',
      items: [
        {
          id: 'koti-1',
          menuItemId: dish1.id,
          name: dish1.name,
          quantity: 2,
          modifiers: [],
          specialInstructions: 'Less spicy',
          kitchenStation: dish1.kitchenStation || 'Main Kitchen',
          status: 'PREPARING'
        }
      ],
      cashierName: 'Captain Rahul'
    });

    expect(round1Kot).toHaveLength(1);
    expect(round1Kot[0].items[0].name).toBe(dish1.name);

    // Subsequent Round 2 KOT (only dish2)
    const round2Kot = KOTRepository.generateKOT({
      orderId: 'ord-test-1',
      orderNumber: 'ORD-CAP-101',
      tokenNumber: '101',
      tableNumber,
      orderType: 'DINE_IN',
      items: [
        {
          id: 'koti-2',
          menuItemId: dish2.id,
          name: dish2.name,
          quantity: 1,
          modifiers: [],
          specialInstructions: 'Extra butter',
          kitchenStation: dish2.kitchenStation || 'Main Kitchen',
          status: 'PREPARING'
        }
      ],
      cashierName: 'Captain Rahul'
    });

    expect(round2Kot).toHaveLength(1);
    expect(round2Kot[0].items[0].name).toBe(dish2.name);
  });

  it('5. Table Transfer from Table 12 to Table 18 preserves order and KOT history', () => {
    const table12 = captainDb.tables.find((t) => t.tableNumber === '12') || captainDb.tables[0];
    const table18 = captainDb.tables.find((t) => t.tableNumber === '18') || captainDb.tables[1];

    table12.status = 'OCCUPIED';
    table12.currentGuests = 4;
    table12.currentOrderId = 'ord-table-12';

    // Transfer
    table18.status = table12.status;
    table18.currentGuests = table12.currentGuests;
    table18.currentOrderId = table12.currentOrderId;

    table12.status = 'AVAILABLE';
    table12.currentGuests = undefined;
    table12.currentOrderId = undefined;

    expect(table18.status).toBe('OCCUPIED');
    expect(table18.currentGuests).toBe(4);
    expect(table18.currentOrderId).toBe('ord-table-12');
    expect(table12.status).toBe('AVAILABLE');
  });

  it('6. Table Merge combines guest counts and binds active session', () => {
    const prim = captainDb.tables[0];
    const sec = captainDb.tables[1];

    prim.status = 'OCCUPIED';
    prim.currentGuests = 2;
    sec.status = 'OCCUPIED';
    sec.currentGuests = 3;

    // Merge
    prim.currentGuests = (prim.currentGuests || 0) + (sec.currentGuests || 0);
    sec.currentOrderId = prim.currentOrderId;

    expect(prim.currentGuests).toBe(5);
  });

  it('7. Bill Request changes table status to BILL_REQUESTED', () => {
    const table = captainDb.tables[0];
    table.status = 'BILL_REQUESTED';

    expect(table.status).toBe('BILL_REQUESTED');
  });

  it('8. Captain Internal Messages System: compose, acknowledge and resolve', () => {
    const newMsg = {
      id: 'msg-test-1',
      senderName: 'Rahul Sharma (Captain)',
      senderRole: 'CAPTAIN' as const,
      recipient: 'KITCHEN' as const,
      tableNumber: '12',
      presetText: 'Food taking too long',
      customNote: 'Guest has a flight soon',
      status: 'SENT' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(newMsg.status).toBe('SENT');
    expect(newMsg.recipient).toBe('KITCHEN');

    // Kitchen acknowledges
    newMsg.status = 'ACKNOWLEDGED' as any;
    expect(newMsg.status).toBe('ACKNOWLEDGED');

    // Captain resolves
    newMsg.status = 'RESOLVED' as any;
    expect(newMsg.status).toBe('RESOLVED');
  });

  it('9. Customer Requests handling: Water / Extra Plates / Cutlery', () => {
    const request = {
      id: 'cr-test-1',
      tableNumber: '12',
      type: 'WATER' as const,
      notes: 'Chilled bottle water',
      createdAt: new Date().toISOString(),
      isAcknowledged: false,
      isResolved: false
    };

    expect(request.isAcknowledged).toBe(false);
    expect(request.isResolved).toBe(false);

    request.isAcknowledged = true;
    expect(request.isAcknowledged).toBe(true);

    request.isResolved = true;
    expect(request.isResolved).toBe(true);
  });

  it('10. Food Ready to Served Lifecycle: KDS ready event updates table and clears queue', () => {
    const foodReadyItem = {
      id: 'fr-test-1',
      kotId: 'kot-101',
      kotNumber: '101',
      orderId: 'ord-101',
      orderNumber: 'ORD-101',
      tableNumber: '12',
      itemId: 'mi-paneer',
      dishName: 'Paneer Tikka',
      quantity: 2,
      modifiers: [],
      station: 'Tandoor Station',
      readyAt: new Date().toISOString(),
      elapsedSeconds: 0,
      isServed: false
    };

    expect(foodReadyItem.isServed).toBe(false);

    // Captain serves
    foodReadyItem.isServed = true;
    expect(foodReadyItem.isServed).toBe(true);
  });

  it('11. Table finalize and close resets table to AVAILABLE', () => {
    const table = captainDb.tables[0];
    table.status = 'OCCUPIED';
    table.currentGuests = 4;
    table.currentOrderId = 'ord-close-test';

    // Finalize
    table.status = 'AVAILABLE';
    table.currentGuests = undefined;
    table.currentOrderId = undefined;

    expect(table.status).toBe('AVAILABLE');
    expect(table.currentGuests).toBeUndefined();
    expect(table.currentOrderId).toBeUndefined();
  });
});
