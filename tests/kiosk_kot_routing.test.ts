import { describe, it, expect, beforeEach } from 'vitest';
import { db, KOTRepository } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import { KOTItem } from '@jamanvaar/types';

/**
 * Covers the kiosk order -> Kitchen Order Ticket pipeline. Previously the
 * kiosk app only ever printed a single customer receipt on its own local
 * printer and never called KOTRepository.generateKOT — so kiosk orders
 * never appeared on the KDS kitchen display, and even when they did (via
 * a future fix) had nowhere to route per-station kitchen tickets since
 * the shared @jamanvaar/api PrinterService only knew about one "active"
 * printer. These tests cover the station-routing added to close that gap.
 */
describe('@jamanvaar/api PrinterService — kitchen station routing', () => {
  it('resolves the correct configured printer role for each known station name', () => {
    expect(PrinterService.getPrinterForStation('Tandoor Section').role).toBe('TANDOOR');
    expect(PrinterService.getPrinterForStation('Beverages Bar').role).toBe('BAR');
    expect(PrinterService.getPrinterForStation('Dessert Counter').role).toBe('DESSERT');
    expect(PrinterService.getPrinterForStation('Curry Station').role).toBe('KITCHEN');
    expect(PrinterService.getPrinterForStation('Main Kitchen').role).toBe('KITCHEN');
    expect(PrinterService.getPrinterForStation('Some Unknown Station').role).toBe('KITCHEN');
  });

  it('dispatches a KOT print job to the resolved station printer, not the kiosk receipt printer', () => {
    db.printJobs = [];
    const kots = KOTRepository.generateKOT({
      orderId: 'ord-test-kiosk-1',
      orderNumber: 'ORD-9001',
      tokenNumber: '42',
      orderType: 'DINE_IN',
      items: [
        { id: 'ki-1', menuItemId: 'item-pt', name: 'Paneer Tikka', quantity: 1, modifiers: [], kitchenStation: 'Tandoor Section', status: 'PREPARING' } as KOTItem,
        { id: 'ki-2', menuItemId: 'item-cc-ice', name: 'Cold Coffee', quantity: 2, modifiers: [], kitchenStation: 'Beverages Bar', status: 'PREPARING' } as KOTItem
      ],
      cashierName: 'Kiosk Self-Order'
    });

    // Two different stations -> two separate KOT records.
    expect(kots.length).toBe(2);

    kots.forEach((kot) => PrinterService.printKOT(kot));

    const tandoorJob = db.printJobs.find((j) => j.kotId === kots.find((k) => k.station === 'Tandoor Section')?.id);
    const barJob = db.printJobs.find((j) => j.kotId === kots.find((k) => k.station === 'Beverages Bar')?.id);

    expect(tandoorJob).toBeDefined();
    expect(barJob).toBeDefined();
    expect(tandoorJob!.type).toBe('KOT_TICKET');
    expect(tandoorJob!.printerId).not.toBe(barJob!.printerId);

    const tandoorPrinter = db.configuredPrinters.find((p) => p.id === tandoorJob!.printerId);
    const barPrinter = db.configuredPrinters.find((p) => p.id === barJob!.printerId);
    expect(tandoorPrinter?.role).toBe('TANDOOR');
    expect(barPrinter?.role).toBe('BAR');
  });

  it('generateKOTText renders the station name and every item with its quantity', () => {
    const kots = KOTRepository.generateKOT({
      orderId: 'ord-test-kiosk-2',
      orderNumber: 'ORD-9002',
      tokenNumber: '43',
      orderType: 'TAKEAWAY',
      items: [
        { id: 'ki-3', menuItemId: 'item-dm', name: 'Dal Makhani', quantity: 3, modifiers: [], kitchenStation: 'Curry Station', status: 'PREPARING' } as KOTItem
      ],
      cashierName: 'Kiosk Self-Order'
    });

    const text = PrinterService.generateKOTText(kots[0]);
    expect(text).toContain('CURRY STATION');
    expect(text).toContain('Dal Makhani');
    expect(text).toContain('x3');
  });
});
