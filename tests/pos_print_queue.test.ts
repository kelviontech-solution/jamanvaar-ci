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

  it('dispatches receipt print job to Print Queue (honest status) and allows retry', async () => {
    // No more ambient fabricated seed orders — create a real one directly.
    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'oi-prn-2',
          orderId: '',
          menuItemId: 'item-bn',
          name: 'Butter Naan',
          sku: 'BN',
          quantity: 2,
          unitPrice: 60,
          modifiers: [],
          totalPrice: 120,
          kitchenStatus: 'SERVED'
        }
      ],
      subtotal: 120,
      taxAmount: 6,
      totalAmount: 126,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });
    // BUG-024/026: only a real transport may report success. The seeded default receipt printer is
    // a real USB printer, which needs the desktop app; make the receipt printer the explicit
    // dev-only emulator to exercise the queue mechanics, and separately prove the USB case fails honestly.
    const realUsb = await PosPrinterService.printOrderReceipt(order, '80mm');
    expect(realUsb.status).toBe('FAILED');
    expect(realUsb.errorMessage).toMatch(/desktop app/i);

    db.printJobs = [];
    const receiptPrinter = PosPrinterService.getPrinterForRole('RECEIPT');
    const originalType = receiptPrinter.interfaceType;
    receiptPrinter.interfaceType = 'VIRTUAL_EMULATOR';
    const job = await PosPrinterService.printOrderReceipt(order, '80mm');
    receiptPrinter.interfaceType = originalType;

    expect(job).toBeDefined();
    expect(job.status).toBe('PRINTED');
    expect(job.type).toBe('RECEIPT_80MM');
    expect(job.orderId).toBe(order.id);

    // Retry really re-sends: on the emulator it prints again (attempt 2); it never fakes success.
    receiptPrinter.interfaceType = 'VIRTUAL_EMULATOR';
    const retried = await PosPrinterService.retryJob(job.id);
    receiptPrinter.interfaceType = originalType;
    expect(retried).not.toBeNull();
    expect(retried?.attempts).toBe(2);
    expect(retried?.status).toBe('PRINTED');

    // Retrying a job on a USB printer outside the desktop app stays FAILED, with the reason.
    const stillFailed = await PosPrinterService.retryJob(job.id);
    expect(stillFailed?.status).toBe('FAILED');
    expect(stillFailed?.errorMessage).toMatch(/desktop app/i);
  });

  it('with no printer configured, receipt/KOT/test printing fails cleanly (a job with the reason), never throws', async () => {
    db.configuredPrinters = [];
    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [{ id: 'oi-np', orderId: '', menuItemId: 'item-bn', name: 'Butter Naan', sku: 'BN', quantity: 1, unitPrice: 60, modifiers: [], totalPrice: 60, kitchenStatus: 'PREPARING' } as any],
      subtotal: 60, taxAmount: 3, totalAmount: 63, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', source_type: 'POS'
    } as any);
    const receipt = await PosPrinterService.printOrderReceipt(order, '80mm');
    expect(receipt.status).toBe('FAILED');
    expect(receipt.errorMessage).toMatch(/no printer/i);
    const slip = await PosPrinterService.printTestSlip('nope');
    expect(slip.status).toBe('FAILED');
  });
});
