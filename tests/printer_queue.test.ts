import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrinterService } from '../packages/api/src/printer';
import { db } from '../packages/database/src/db';
import { Order } from '../packages/types/src';

const mockOrder: Order = {
  id: `ord-test-printer-${Date.now()}`,
  orderNumber: 'ORD-501',
  tokenNumber: '108',
  restaurantId: 'rest-1',
  outletId: 'out-1',
  kioskId: 'KIOSK-01',
  sessionId: 'sess-prn',
  idempotencyKey: `idemp-prn-${Date.now()}`,
  orderType: 'DINE_IN',
  tableNumber: '12',
  items: [
    {
      id: 'oi-1',
      orderId: 'ord-test-printer',
      menuItemId: 'item-pt',
      name: 'Paneer Tikka (Tandoori Special)',
      sku: 'PT-01',
      quantity: 2,
      unitPrice: 240,
      modifiers: [
        {
          groupId: 'mod-1',
          groupName: 'Add-ons',
          optionId: 'opt-1',
          optionName: 'Extra Mint Chutney',
          priceDelta: 20
        }
      ],
      totalPrice: 520
    }
  ],
  subtotal: 520,
  discountAmount: 20,
  couponCode: 'SAVE20',
  cgstAmount: 12.5,
  sgstAmount: 12.5,
  taxAmount: 25,
  serviceChargeAmount: 0,
  tipAmount: 0,
  roundOffAmount: 0,
  totalAmount: 525,
  paymentMethod: 'UPI_QR',
  paymentStatus: 'SUCCESS',
  orderStatus: 'CONFIRMED',
  estimatedWaitMinutes: 15,
  pickupCounter: 'Counter 1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isSynced: true
};

describe('PrinterService & Automatic Built-in Kiosk Thermal Spooler', () => {
  // BUG-024: only a real transport may report a job PRINTED. These tests exercise the queue
  // mechanics (dedupe, retry, offline handling), so they run against the explicit dev-only
  // VIRTUAL_EMULATOR type; the seeded USB printer has no real driver and is tested separately.
  const kioskPrinter = () => db.configuredPrinters.find((p) => p.id === 'prn-kiosk-01')!;
  let originalType: string;
  beforeEach(() => {
    originalType = kioskPrinter().interfaceType;
    kioskPrinter().interfaceType = 'VIRTUAL_EMULATOR';
  });
  afterEach(() => {
    kioskPrinter().interfaceType = originalType as any;
  });

  it('a USB printer, used outside the desktop app, reports a failed print, never a false success', async () => {
    kioskPrinter().interfaceType = 'USB';
    kioskPrinter().status = 'READY';
    const usbOrder: Order = { ...mockOrder, id: `ord-usb-prn-${Date.now()}` };
    const res = await PrinterService.printReceipt(usbOrder);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/desktop app/i);
  });

  it('should auto-detect and configure built-in thermal printer on startup', () => {
    const res = PrinterService.autoConfigureKioskPrinter();
    expect(res.success).toBe(true);
    expect(res.printer.isKioskBuiltIn).toBe(true);
    expect(res.printer.paperSize).toBe('80mm');
    expect(PrinterService.isOnline()).toBe(true);
  });

  it('should format clean 80mm thermal receipt with logo, wrapped items, token and taxes', () => {
    const text80 = PrinterService.generateReceiptText(mockOrder, undefined, '80mm');
    expect(text80).toContain('JAMANVAAR');
    expect(text80).toContain('ORDER #ORD-501');
    expect(text80).toContain('TOKEN #108');
    expect(text80).toContain('Paneer Tikka');
    expect(text80).toContain('Extra Mint Chutney');
    expect(text80).toContain('CGST @ 2.5%:');
    expect(text80).toContain('TOTAL AMOUNT:');
    expect(text80).toContain('COUNTER 1');
  });

  it('should format 58mm compact thermal receipt', () => {
    const text58 = PrinterService.generateReceiptText(mockOrder, undefined, '58mm');
    expect(text58).toContain('JAMANVAAR');
    expect(text58).toContain('TOKEN #108');
    expect(text58).toContain('TOTAL AMOUNT:');
  });

  it('should generate ESC/POS command bytecode including initialization and cut commands', () => {
    const bytecode = PrinterService.generateEscPosBytecode(mockOrder, '80mm');
    expect(bytecode.length).toBeGreaterThan(100);
    expect(bytecode[0]).toBe(0x1b);
    expect(bytecode[1]).toBe(0x40);
  });

  it('should queue print job, enforce duplicate protection, and process print queue', async () => {
    db.orders.push(mockOrder);
    const qRes = PrinterService.queuePrintJob(mockOrder, false);
    expect(qRes.success).toBe(true);

    await PrinterService.processQueue();
    expect(qRes.job.status).toBe('PRINTED');

    // Attempting to auto-print again without isReprint must prevent duplicate printing
    const dupRes = PrinterService.queuePrintJob(mockOrder, false);
    expect(dupRes.message).toContain('already printed');

    // Explicit admin reprint should succeed
    const reprintRes = await PrinterService.reprintReceipt(mockOrder.id, 'admin');
    expect(reprintRes.success).toBe(true);
  });

  it('should gracefully handle offline printer state without failing the order', async () => {
    PrinterService.setPrinterStatus('prn-kiosk-01', 'OFFLINE', 'Simulated Paper Out');
    expect(PrinterService.isOnline()).toBe(false);

    const offlineOrder: Order = { ...mockOrder, id: `ord-offline-prn-${Date.now()}` };
    const printRes = await PrinterService.printReceipt(offlineOrder);
    expect(printRes.success).toBe(false);
    expect(printRes.message).toMatch(/offline|paper out/i);

    // Restore printer to ready
    PrinterService.setPrinterStatus('prn-kiosk-01', 'READY');
    expect(PrinterService.isOnline()).toBe(true);
    const recoverRes = await PrinterService.processQueue();
    expect(recoverRes.processed).toBeGreaterThan(0);
  });

  it('with no printer configured at all (a fresh real restaurant) printing fails cleanly instead of throwing', async () => {
    const saved = db.configuredPrinters;
    db.configuredPrinters = [];
    try {
      const noPrinterOrder: Order = { ...mockOrder, id: `ord-noprn-${Date.now()}` };
      const res = await PrinterService.printReceipt(noPrinterOrder);
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/no printer/i);
      const slip = await PrinterService.printTestSlip();
      expect(slip.success).toBe(false);
      expect(slip.message).toMatch(/no printer/i);
    } finally {
      db.configuredPrinters = saved;
    }
  });
});
