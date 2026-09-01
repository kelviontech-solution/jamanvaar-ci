import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, ShiftRepository } from '@jamanvaar/database';
import { MenuItem, SelectedModifier } from '@jamanvaar/types';

describe('POS Cart & Billing Engine Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('calculates order total, GST taxes (2.5% CGST + 2.5% SGST), and round-off accurately', () => {
    const paneerTikka = db.menuItems.find((i) => i.id === 'item-pt') || db.menuItems[0];
    const naan = db.menuItems.find((i) => i.id === 'item-bn') || db.menuItems[1];

    const item1Qty = 2; // e.g. 240 * 2 = 480
    const item2Qty = 3; // e.g. 60 * 3 = 180
    const subtotal = paneerTikka.price * item1Qty + naan.price * item2Qty;

    const discountAmount = 30; // ₹30 discount
    const taxable = subtotal - discountAmount;
    const cgst = Number(((taxable * 2.5) / 100).toFixed(2));
    const sgst = Number(((taxable * 2.5) / 100).toFixed(2));
    const tax = cgst + sgst;
    const rawTotal = taxable + tax;
    const rounded = Math.round(rawTotal);

    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '14',
      items: [
        {
          id: 'oi-t1',
          orderId: '',
          menuItemId: paneerTikka.id,
          name: paneerTikka.name,
          sku: paneerTikka.sku,
          quantity: item1Qty,
          unitPrice: paneerTikka.price,
          modifiers: [],
          totalPrice: paneerTikka.price * item1Qty,
          kitchenStatus: 'PREPARING'
        },
        {
          id: 'oi-t2',
          orderId: '',
          menuItemId: naan.id,
          name: naan.name,
          sku: naan.sku,
          quantity: item2Qty,
          unitPrice: naan.price,
          modifiers: [],
          totalPrice: naan.price * item2Qty,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal,
      discountAmount,
      cgstAmount: cgst,
      sgstAmount: sgst,
      taxAmount: tax,
      totalAmount: rounded,
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      orderStatus: 'PREPARING',
      source_type: 'POS'
    });

    expect(order).toBeDefined();
    expect(order.orderNumber).toBeDefined();
    expect(order.subtotal).toBe(subtotal);
    expect(order.totalAmount).toBe(rounded);
    expect(order.orderStatus).toBe('PREPARING');
  });

  it('settles an order atomically and updates status to COMPLETED and table to AVAILABLE', () => {
    // Setup a table
    const table = db.tables[0];
    table.status = 'OCCUPIED';

    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      tableNumber: table.tableNumber,
      items: [],
      subtotal: 500,
      taxAmount: 25,
      totalAmount: 525,
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      orderStatus: 'PREPARING',
      source_type: 'POS'
    });

    table.currentOrderId = order.id;

    // Settle Order
    const settled = OrderRepository.settleOrder(order.id, 'UPI_QR', 525, 'UPI-REF-9921', 'Amit Dave');

    expect(settled).not.toBeNull();
    expect(settled?.paymentStatus).toBe('SUCCESS');
    expect(settled?.orderStatus).toBe('COMPLETED');
    expect(settled?.paymentTransactionId).toBe('UPI-REF-9921');

    // Table should now be released
    const updatedTable = db.tables.find((t) => t.id === table.id);
    expect(updatedTable?.status).toBe('AVAILABLE');
    expect(updatedTable?.currentOrderId).toBeUndefined();
  });
});
