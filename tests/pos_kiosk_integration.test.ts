import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, ReceiptRepository } from '@jamanvaar/database';

describe('Kiosk -> POS Real-Time Integration Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('allows Kiosk to place Token order which appears immediately in shared restaurant db for POS cashier to settle', () => {
    // 1. Kiosk creates customer order with Cash at Counter
    const kioskOrder = OrderRepository.createOrder({
      kioskId: 'KIOSK-01',
      tokenNumber: '108',
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'oi-k1',
          orderId: '',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka',
          sku: 'PT',
          quantity: 2,
          unitPrice: 240,
          modifiers: [],
          totalPrice: 480,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: 480,
      taxAmount: 24,
      totalAmount: 504,
      paymentMethod: 'CASH_AT_COUNTER',
      paymentStatus: 'PENDING',
      orderStatus: 'CONFIRMED',
      source_type: 'KIOSK'
    });

    expect(kioskOrder).toBeDefined();
    expect(kioskOrder.tokenNumber).toBe('108');

    // 2. POS Terminal sees order in live queue
    const orderInPos = OrderRepository.getOrderById(kioskOrder.id);
    expect(orderInPos).toBeDefined();
    expect(orderInPos?.paymentStatus).toBe('PENDING');

    // 3. POS Cashier accepts Cash and settles order
    const settled = OrderRepository.settleOrder(kioskOrder.id, 'CASH', 504, 'CSH-01', 'Amit Dave');
    expect(settled?.paymentStatus).toBe('SUCCESS');
    expect(settled?.orderStatus).toBe('COMPLETED');

    // 4. Receipt is stored in receipt repository
    ReceiptRepository.addRecord({
      id: `rec-${Date.now()}`,
      orderId: settled!.id,
      orderNumber: settled!.orderNumber,
      tokenNumber: settled!.tokenNumber,
      deliveryMethod: 'PRINT',
      deliveryStatus: 'SENT',
      recipient: 'Customer Counter',
      content: `JAMANVAAR INVOICE #${settled!.orderNumber}`,
      createdAt: new Date().toISOString()
    });

    const receipts = ReceiptRepository.getAllRecords();
    expect(receipts.some((r) => r.orderId === settled!.id)).toBe(true);
  });
});
