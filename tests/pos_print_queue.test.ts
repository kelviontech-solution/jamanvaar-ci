import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, PrintQueueRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';

describe('POS Thermal Print Queue & Hardware HAL Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.printJobs = [];
  });

  it('generates 80mm ESC/POS thermal text containing GSTIN, FSSAI, token, items and taxes', () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '12',
      items: [
        {
          id: 'oi-prn-1',
          orderId: '',
          menuItemId: 'item-pt',
          name: 'Paneer Tikka',
          sku: 'PT',
          quantity: 2,
          unitPrice: 240,
          modifiers: [{ groupId: 'mod-1', groupName: 'Addon', optionId: 'opt-1', optionName: 'Extra Cheese', priceDelta: 35 }],
          totalPrice: 550,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: 550,
      discountAmount: 25,
      cgstAmount: 13.13,
      sgstAmount: 13.13,
      taxAmount: 26.25,
      totalAmount: 551,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    const receiptText = PosPrinterService.generateReceiptText(order, '80mm');

    expect(receiptText).toContain('JAMANVAAR');
    expect(receiptText).toContain('GSTIN:');
    expect(receiptText).toContain('FSSAI Lic:');
    expect(receiptText).toContain(order.orderNumber);
    expect(receiptText).toContain(`TOKEN: #${order.tokenNumber}`);
    expect(receiptText).toContain('Paneer Tikka');
    expect(receiptText).toContain('Extra Cheese');
    expect(receiptText).toContain('551');
  });

  it('dispatches receipt print job to Print Queue with SUCCESS status and allows retry', async () => {
    const order = OrderRepository.getOrderById('ord-1043') || db.orders[0];
    const job = await PosPrinterService.printOrderReceipt(order, '80mm');

    expect(job).toBeDefined();
    expect(job.status).toBe('SUCCESS');
    expect(job.type).toBe('RECEIPT_80MM');
    expect(job.orderId).toBe(order.id);

    // Test retry
    const retried = PrintQueueRepository.retryJob(job.id);
    expect(retried).not.toBeNull();
    expect(retried?.attempts).toBe(2);
  });
});
