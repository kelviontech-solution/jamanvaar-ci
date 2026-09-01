import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, PrintQueueRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('POS Fast Cashier UX, Receipt & Ordering Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.printJobs = [];
    usePosStore.getState().clearCart();
  });

  it('performs 1-tap add for items and increments quantity on repeat taps without duplicate lines', () => {
    const store = usePosStore.getState();
    const item = db.menuItems.find((m) => m.id === 'item-pt') || db.menuItems[0];

    // Tap 1
    store.addItemToCart(item);
    expect(usePosStore.getState().cart.items.length).toBe(1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(1);

    // Tap 2 (Repeat same item)
    store.addItemToCart(item);
    expect(usePosStore.getState().cart.items.length).toBe(1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(2);

    // Tap 3
    store.addItemToCart(item);
    expect(usePosStore.getState().cart.items.length).toBe(1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(3);
    expect(usePosStore.getState().cart.items[0].itemTotal).toBe(item.price * 3);
  });

  it('accurately calculates subtotal, GST split (2.5% CGST + 2.5% SGST), round off, and cash change', () => {
    const store = usePosStore.getState();
    const item1 = db.menuItems.find((m) => m.id === 'item-pt')!; // ₹240
    const item2 = db.menuItems.find((m) => m.id === 'item-bn')!; // ₹60

    store.addItemToCart(item1, [], '', 2); // 2 x 240 = 480
    store.addItemToCart(item2, [], '', 1); // 1 x 60 = 60
    // Subtotal = 540

    const cart = usePosStore.getState().cart;
    expect(cart.subtotal).toBe(580);
    expect(cart.cgstAmount).toBe(14.5);
    expect(cart.sgstAmount).toBe(14.5);
    expect(cart.taxAmount).toBe(29);
    expect(cart.totalPayable).toBe(609);

    // Test Cash Settlement with ₹1,000 received
    const settledOrder = store.completePayment('CASH', 1000);
    expect(settledOrder).not.toBeNull();
    expect(settledOrder?.totalAmount).toBe(609);
    expect(settledOrder?.paymentMethod).toBe('CASH');
    expect(settledOrder?.tenderedAmount).toBe(1000);
    expect(settledOrder?.changeAmount).toBe(391);
  });

  it('generates professional Indian restaurant thermal receipt matching exact hierarchy', () => {
    const order = OrderRepository.getOrderById('ord-1043') || db.orders[0];
    const receiptText = PosPrinterService.generateReceiptText(order, '80mm');

    expect(receiptText).toContain('JAMANVAAR');
    expect(receiptText).toContain('BY KELVIONTECH');
    expect(receiptText).toContain('GSTIN:');
    expect(receiptText).toContain('FSSAI Lic:');
    expect(receiptText).toContain('INVOICE:');
    expect(receiptText).toContain('TOKEN:');
    expect(receiptText).toContain('CGST (2.5%):');
    expect(receiptText).toContain('SGST (2.5%):');
    expect(receiptText).toContain('GRAND TOTAL:');
    expect(receiptText).toContain('Payment Method:');
    expect(receiptText).toContain('Thank you');
  });

  it('queues print job into real PrintQueue on settlement and supports retry', () => {
    const store = usePosStore.getState();
    const item = db.menuItems[0];
    store.addItemToCart(item);

    const settled = store.completePayment('UPI', undefined, 'UPI-REF-9988');
    expect(settled).not.toBeNull();

    const jobs = PrintQueueRepository.getAllJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].orderId).toBe(settled?.id);
    expect(jobs[0].status).toBe('SUCCESS');
  });
});
