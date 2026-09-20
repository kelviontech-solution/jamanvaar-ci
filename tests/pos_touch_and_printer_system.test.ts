import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, OrderRepository, PrintQueueRepository, ReceiptRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { Order, MenuItem, KOTRecord } from '@jamanvaar/types';

describe('JAMANVAAR POS — Touchscreen & Automatic Printer System Suite', () => {
  beforeEach(() => {
    db.orders = [];
    db.printJobs = [];
    db.receiptRecords = [];
    usePosStore.getState().clearCart();
  });

  it('1. should discover all configured hardware, network, and driver printers with roles', () => {
    const printers = PosPrinterService.discoverPrinters();
    expect(printers.length).toBeGreaterThanOrEqual(6);

    const receiptPrinter = PosPrinterService.getPrinterForRole('RECEIPT');
    expect(receiptPrinter).toBeDefined();
    expect(receiptPrinter.paperSize).toBe('80mm');

    const kitchenPrinter = PosPrinterService.getPrinterForRole('KITCHEN');
    expect(kitchenPrinter).toBeDefined();
    expect(kitchenPrinter.interfaceType).toBe('NETWORK_LAN');

    const tandoorPrinter = PosPrinterService.getPrinterForRole('TANDOOR');
    expect(tandoorPrinter).toBeDefined();

    const barPrinter = PosPrinterService.getPrinterForRole('BAR');
    expect(barPrinter).toBeDefined();

    const dessertPrinter = PosPrinterService.getPrinterForRole('DESSERT');
    expect(dessertPrinter).toBeDefined();
  });

  it('2. BUG-025: a "scan" never invents READY status, and honestly says it cannot detect new hardware', () => {
    const victim = db.configuredPrinters[0];
    victim.status = 'OFFLINE';
    const scanResult = PosPrinterService.scanForPrinters();
    expect(scanResult.totalFound).toBe(db.configuredPrinters.length);
    // Previously every non-ERROR/PAPER_OUT printer was forced to READY and reported "Found N".
    expect(victim.status).toBe('OFFLINE');
    expect(scanResult.canDetectNewHardware).toBe(false);
    expect(scanResult.note).toMatch(/not available|cannot detect/i);
  });

  it('3. should automatically route KOTs to specific station printers (Tandoor, Kitchen, Bar, Dessert)', () => {
    // Tandoor item
    const tandoorPrinter = PosPrinterService.getPrinterForStation('Tandoor');
    expect(tandoorPrinter.role).toBe('TANDOOR');
    expect(tandoorPrinter.name).toContain('Tandoor');

    // Curry / Main kitchen item
    const kitchenPrinter = PosPrinterService.getPrinterForStation('Curry Station');
    expect(kitchenPrinter.role).toBe('KITCHEN');
    expect(kitchenPrinter.name).toContain('Kitchen');

    // Beverage / Bar item
    const barPrinter = PosPrinterService.getPrinterForStation('Beverages & Bar');
    expect(barPrinter.role).toBe('BAR');
    expect(barPrinter.name).toContain('Bar');

    // Dessert item
    const dessertPrinter = PosPrinterService.getPrinterForStation('Dessert Counter');
    expect(dessertPrinter.role).toBe('DESSERT');
    expect(dessertPrinter.name).toContain('Dessert');
  });

  it('4. should generate ESC/POS receipt text for both 80mm and 58mm paper sizes', () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: 'T-04',
      customerName: 'Rahul Mehta',
      customerPhone: '9876543210',
      items: [
        {
          id: 'oi-1',
          orderId: '',
          menuItemId: 'dish-paneer-tikka',
          name: 'Paneer Tikka Masala',
          sku: 'PTM-01',
          modifiers: [],
          quantity: 2,
          unitPrice: 280,
          totalPrice: 560,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: 560,
      discountAmount: 0,
      cgstAmount: 14,
      sgstAmount: 14,
      taxAmount: 28,
      totalAmount: 588,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    const receipt80 = PosPrinterService.generateReceiptText(order, '80mm');
    expect(receipt80).toContain('JAMANVAAR');
    expect(receipt80).toContain('Paneer Tikka Masala');
    expect(receipt80).toContain('588');
    expect(receipt80).toContain('T-04');

    const receipt58 = PosPrinterService.generateReceiptText(order, '58mm');
    expect(receipt58).toContain('JAMANVAAR');
    expect(receipt58).toContain('588');
  });

  it('5. should dispatch persistent print jobs on receipt printing and survive in queue', async () => {
    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'oi-2',
          orderId: '',
          menuItemId: 'dish-dal-makhani',
          name: 'Dal Makhani',
          sku: 'DM-01',
          modifiers: [],
          quantity: 1,
          unitPrice: 220,
          totalPrice: 220,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: 220,
      discountAmount: 0,
      cgstAmount: 5.5,
      sgstAmount: 5.5,
      taxAmount: 11,
      totalAmount: 231,
      paymentMethod: 'UPI_QR',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    const job = await PosPrinterService.printOrderReceipt(order, '80mm');
    expect(job).toBeDefined();
    expect(job.orderId).toBe(order.id);
    // BUG-024: the job persists and is linked to the order either way — but its status is
    // the truth, not an assumed SUCCESS. The default receipt printer here is a real USB
    // printer (see BUG-026); run outside the desktop app it must fail honestly, not claim it printed.
    expect(job.status).toBe('FAILED');
    expect(job.errorMessage).toMatch(/desktop app/i);
    expect(db.printJobs.length).toBe(1);
    expect(db.printJobs[0].id).toBe(job.id);
  });

  it('6. should execute 1-tap Instant Bill: commit sale, auto-print receipt, and reset cart for next customer', async () => {
    const item = db.menuItems[0];
    usePosStore.getState().addItemToCart(item);
    expect(usePosStore.getState().cart.items.length).toBe(1);

    const completed = await usePosStore.getState().executeInstantBill('CASH');
    expect(completed).toBeDefined();
    expect(completed?.orderStatus).toBe('COMPLETED');
    expect(completed?.paymentMethod).toBe('CASH');

    // Cart must be reset cleanly for next customer
    expect(usePosStore.getState().cart.items.length).toBe(0);
    // Real receipt record created in DB
    expect(db.receiptRecords.length).toBe(1);
    // Print job queued for receipt printer
    expect(db.printJobs.length).toBeGreaterThanOrEqual(1);
  });

  it('7. should support manual reprint with audit logging and preserve original sale integrity', async () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: 'T-01',
      items: [
        {
          id: 'oi-3',
          orderId: '',
          menuItemId: 'dish-butter-naan',
          name: 'Butter Naan',
          sku: 'BN-01',
          modifiers: [],
          quantity: 4,
          unitPrice: 40,
          totalPrice: 160,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: 160,
      discountAmount: 0,
      cgstAmount: 4,
      sgstAmount: 4,
      taxAmount: 8,
      totalAmount: 168,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    const reprintJob = await PosPrinterService.reprintReceipt(order, 'Customer lost receipt', 'Cashier Om');
    expect(reprintJob).toBeDefined();
    expect(reprintJob.isReprint).toBe(true);
    expect(db.printJobs.length).toBe(1);

    // Audit log recorded
    const reprintAudit = db.auditLogs.find((a) => a.action === 'RECEIPT_REPRINT');
    expect(reprintAudit).toBeDefined();
    expect(reprintAudit?.details).toContain(order.orderNumber);
  });

  it('8. should support diagnostic test slip printing to any configured printer', async () => {
    const testJob = await PosPrinterService.printTestSlip('prn-tandoor-01', '80mm');
    expect(testJob).toBeDefined();
    expect(testJob.type).toBe('TEST_PAGE');
    expect(testJob.rawPayload).toContain('HARDWARE DIAGNOSTIC TEST SLIP');
    expect(testJob.rawPayload).toContain('Tandoor');
  });

  it('9. dispatches real ESC/POS bytes to a NETWORK_LAN kitchen printer inside a Tauri runtime, and corrects the job to FAILED on a real send failure', async () => {
    const invokeMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.__TAURI_INTERNALS__ = {};

    const kot: KOTRecord = {
      id: 'kot-net-1',
      kotNumber: 'KOT-901',
      orderId: 'ord-net-1',
      orderNumber: 'ORD-901',
      tokenNumber: '901',
      station: 'Main Kitchen',
      type: 'FIRST',
      orderType: 'DINE_IN',
      cashierName: 'Cashier Om',
      items: [],
      createdAt: new Date().toISOString(),
      printed: false,
      status: 'PENDING'
    };

    const job = await PosPrinterService.printKOT(kot);
    expect(job.status).toBe('FAILED');
    expect(job.errorMessage).toContain('ECONNREFUSED');

    vi.doUnmock('@tauri-apps/api/core');
    delete (globalThis as any).window.__TAURI_INTERNALS__;
    // 20s: the first `await import('@tauri-apps/api/core')` is a cold module transform that can
    // exceed the 5s default when the whole suite runs in parallel (it takes ~100ms alone).
  }, 20000);

  it('9. should continue offline billing and receipt printing without internet connection', async () => {
    // Simulate offline network
    usePosStore.getState().toggleNetworkStatus();
    expect(usePosStore.getState().isOnline).toBe(false);

    const item = db.menuItems[1] || db.menuItems[0];
    usePosStore.getState().addItemToCart(item);
    const order = await usePosStore.getState().executeInstantBill('CASH');

    expect(order).toBeDefined();
    expect(order?.totalAmount).toBeGreaterThan(0);
    // Local DB and local printer succeed offline
    expect(db.orders.length).toBe(1);
    expect(db.printJobs.length).toBe(1);
  });
});
