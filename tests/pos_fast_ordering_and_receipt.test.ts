import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    // No more ambient fabricated seed orders — settle a real cart first.
    const store = usePosStore.getState();
    store.addItemToCart(db.menuItems.find((m) => m.id === 'item-pt') || db.menuItems[0]);
    const order = store.completePayment('CASH', 1000)!;
    expect(order).toBeDefined();
    const receiptText = PosPrinterService.generateReceiptText(order, '80mm');

    expect(receiptText).toContain('JAMANVAAR');
    // BUG-028: no hardcoded brand/tagline lines on a restaurant's receipt.
    expect(receiptText).not.toContain('BY KELVIONTECH');
    expect(receiptText).not.toContain('Authentic Heritage');
    expect(receiptText).toContain('GSTIN:');
    expect(receiptText).toContain('FSSAI Lic:');
    expect(receiptText).toContain('INVOICE:');
    expect(receiptText).toContain('TOKEN:');
    expect(receiptText).toMatch(/CGST \([\d.]+%\):/);
    expect(receiptText).toMatch(/SGST \([\d.]+%\):/);
    expect(receiptText).toContain('GRAND TOTAL:');
    expect(receiptText).toContain('Payment Method:');
    expect(receiptText).toContain('Thank you');
  });

  it('queues print job into real PrintQueue on settlement and supports retry', async () => {
    const store = usePosStore.getState();
    const item = db.menuItems[0];
    store.addItemToCart(item);

    const settled = store.completePayment('UPI', undefined, 'UPI-REF-9988');
    expect(settled).not.toBeNull();

    const jobs = PrintQueueRepository.getAllJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].orderId).toBe(settled?.id);
    // BUG-025/026: the default printer here is a real USB printer, so printing genuinely needs the
    // desktop app's native transport — settlement fires the print without blocking the sale on it, so
    // its outcome (here: failing honestly, since this test runs outside the desktop app) lands a moment
    // later, not in the same tick as completePayment().
    await vi.waitFor(() => {
      const job = PrintQueueRepository.getAllJobs().find((j) => j.id === jobs[0].id);
      expect(job?.status).toBe('FAILED');
    });
  });
});
