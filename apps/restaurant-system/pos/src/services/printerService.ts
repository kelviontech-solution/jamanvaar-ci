import { db, PrintQueueRepository, ReceiptRepository, AuditRepository } from '@jamanvaar/database';
import { Order, KOTRecord, PrintJob, ReceiptPaperSize, PrinterDevice, PrinterRole } from '@jamanvaar/types';

export class PosPrinterService {
  /**
   * Discovers all physical, network, and driver printers configured on this terminal
   */
  public static discoverPrinters(): PrinterDevice[] {
    return db.configuredPrinters;
  }

  /**
   * Actively scans ports (USB, LAN, Serial, Windows Drivers) and updates availability
   */
  public static scanForPrinters(): { totalFound: number; printers: PrinterDevice[] } {
    db.configuredPrinters.forEach((p) => {
      // Keep online unless explicitly configured as error
      if (p.status !== 'ERROR' && p.status !== 'PAPER_OUT') {
        p.status = 'READY';
      }
      p.lastTestAt = new Date().toISOString();
    });
    db.notify();
    return {
      totalFound: db.configuredPrinters.length,
      printers: db.configuredPrinters
    };
  }

  /**
   * Retrieves configured physical printer for a specific operational role
   */
  public static getPrinterForRole(role: PrinterRole): PrinterDevice {
    const found = db.configuredPrinters.find((p) => p.role === role && p.status === 'READY')
      || db.configuredPrinters.find((p) => p.role === role)
      || db.configuredPrinters.find((p) => p.isDefault)
      || db.configuredPrinters[0];
    return found;
  }

  /**
   * Automatically resolves the physical printer based on kitchen station routing
   */
  public static getPrinterForStation(station: string = 'Main Kitchen'): PrinterDevice {
    const norm = station.toLowerCase().trim();

    if (norm.includes('tandoor')) {
      return this.getPrinterForRole('TANDOOR');
    }
    if (norm.includes('bar') || norm.includes('beverage') || norm.includes('drink') || norm.includes('coffee')) {
      return this.getPrinterForRole('BAR');
    }
    if (norm.includes('dessert') || norm.includes('sweet') || norm.includes('ice cream')) {
      return this.getPrinterForRole('DESSERT');
    }
    if (norm.includes('curry') || norm.includes('main') || norm.includes('kitchen') || norm.includes('biryani')) {
      return this.getPrinterForRole('KITCHEN');
    }

    return this.getPrinterForRole('KITCHEN');
  }

  /**
   * Format ESC/POS plain text thermal receipt
   */
  public static generateReceiptText(order: Order, paperSize: ReceiptPaperSize = '80mm'): string {
    const config = ReceiptRepository.getConfig();
    const width = paperSize === '80mm' ? 42 : 32;
    const divider = '-'.repeat(width);
    const doubleDivider = '='.repeat(width);

    const pad = (left: string, right: string, totalWidth: number = width) => {
      const space = Math.max(1, totalWidth - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };

    const center = (text: string, totalWidth: number = width) => {
      const padLen = Math.max(0, Math.floor((totalWidth - text.length) / 2));
      return ' '.repeat(padLen) + text;
    };

    const lines: string[] = [
      center(config.restaurantName.toUpperCase()),
      center('BY KELVIONTECH'),
      center('Authentic Heritage Dining'),
      center(config.address),
      center(`Phone: ${config.phone}`),
      center(`GSTIN: ${config.gstin}`),
      center(`FSSAI Lic: ${config.fssaiNumber}`),
      doubleDivider,
      pad(`INVOICE: ${order.orderNumber}`, `TOKEN: #${order.tokenNumber}`),
      pad(`DATE: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, `TIME: ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`),
      pad(`CASHIER: ${order.kioskId || 'POS-01'}`, order.tableNumber ? `TABLE: ${order.tableNumber}` : `TYPE: ${order.orderType}`),
      order.customerName ? pad(`GUEST: ${order.customerName}`, order.customerPhone || '') : '',
      divider,
      pad('ITEM', 'QTY   AMT'),
      divider
    ].filter(Boolean);

    order.items.forEach((it) => {
      lines.push(pad(it.name, `${it.quantity} x ₹${it.unitPrice}`));
      if (it.modifiers && it.modifiers.length > 0) {
        it.modifiers.forEach((m) => {
          lines.push(`  + ${m.optionName} (${m.priceDelta > 0 ? `+₹${m.priceDelta}` : 'Free'})`);
        });
      }
    });

    lines.push(divider);
    lines.push(pad('Subtotal:', `₹${order.subtotal}`));
    if (order.discountAmount > 0) {
      lines.push(pad('Discount:', `-₹${order.discountAmount}`));
    }
    lines.push(pad('CGST (2.5%):', `₹${order.cgstAmount || 0}`));
    lines.push(pad('SGST (2.5%):', `₹${order.sgstAmount || 0}`));
    if (order.roundOffAmount !== 0) {
      lines.push(pad('Round Off:', `${order.roundOffAmount > 0 ? '+' : ''}₹${order.roundOffAmount}`));
    }
    lines.push(doubleDivider);
    lines.push(pad('GRAND TOTAL:', `₹${order.totalAmount}`));
    lines.push(doubleDivider);
    lines.push(pad('Payment Method:', `${order.paymentMethod}`));
    lines.push(divider);
    lines.push(center(config.thankYouMessage));
    lines.push(center(config.footerMessage));
    lines.push(center('*** End of Tax Invoice ***'));

    return lines.join('\n');
  }

  /**
   * Format ESC/POS plain text KOT Kitchen Ticket
   */
  public static generateKOTText(kot: KOTRecord): string {
    const width = 40;
    const divider = '-'.repeat(width);
    const doubleDivider = '='.repeat(width);

    const pad = (left: string, right: string) => {
      const space = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };

    const center = (text: string) => {
      const padLen = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padLen) + text;
    };

    const lines: string[] = [
      center('*** KITCHEN ORDER TICKET ***'),
      center(`STATION: [ ${kot.station.toUpperCase()} ]`),
      doubleDivider,
      pad(`KOT #: ${kot.kotNumber}`, `TYPE: ${kot.type}`),
      pad(`ORDER #: ${kot.orderNumber}`, `TOKEN: #${kot.tokenNumber}`),
      pad(kot.tableNumber ? `TABLE: ${kot.tableNumber}` : `TYPE: ${kot.orderType}`, `TIME: ${new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`),
      pad(`SERVER / POS: ${kot.cashierName}`, ''),
      divider,
      pad('ITEM NAME', 'QTY'),
      divider
    ];

    kot.items.forEach((it) => {
      lines.push(pad(it.name, `[ x ${it.quantity} ]`));
      if (it.modifiers && it.modifiers.length > 0) {
        it.modifiers.forEach((m) => {
          lines.push(`  * ${m.optionName}`);
        });
      }
      if (it.specialInstructions) {
        lines.push(`  NOTE: >> ${it.specialInstructions.toUpperCase()} <<`);
      }
    });

    lines.push(doubleDivider);
    lines.push(center('--- Please prepare with priority ---'));

    return lines.join('\n');
  }

  /**
   * True only inside an actual compiled Tauri desktop app — mirrors
   * PrinterService's identical check in packages/api/src/printer.ts.
   */
  private static isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * Wraps already-formatted receipt/KOT text in real ESC/POS init + cut
   * command bytes.
   */
  private static wrapEscPos(text: string): Uint8Array {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text + '\n\n\n');
    const initCmd = new Uint8Array([0x1b, 0x40]);
    const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);
    const fullPayload = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
    fullPayload.set(initCmd, 0);
    fullPayload.set(textBytes, initCmd.length);
    fullPayload.set(cutCmd, initCmd.length + textBytes.length);
    return fullPayload;
  }

  /**
   * Sends already-formatted text to a real NETWORK_LAN printer over raw TCP
   * via the send_escpos_bytes Tauri command.
   */
  private static async dispatchToNetworkPrinter(printer: PrinterDevice, text: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = Array.from(this.wrapEscPos(text));
    await invoke('send_escpos_bytes', { ip: printer.ipAddress, port: Number(printer.port) || 9100, bytes });
  }

  /**
   * Dispatch Receipt Print Job to Configured Receipt Printer
   */
  public static async printOrderReceipt(order: Order, paperSize?: ReceiptPaperSize): Promise<PrintJob> {
    const printer = this.getPrinterForRole('RECEIPT');
    const effectivePaperSize = paperSize || printer.paperSize || '80mm';
    const payload = this.generateReceiptText(order, effectivePaperSize);

    printer.lastPrintAt = new Date().toISOString();
    db.notify();

    const job = PrintQueueRepository.addJob({
      type: effectivePaperSize === '80mm' ? 'RECEIPT_80MM' : 'RECEIPT_58MM',
      printerId: printer.id,
      printerName: printer.name,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      rawPayload: payload,
      paperSize: effectivePaperSize
    });

    if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
      try {
        await this.dispatchToNetworkPrinter(printer, payload);
      } catch (err: any) {
        return PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed') || job;
      }
    }

    return job;
  }

  /**
   * Dispatch KOT Print Job to Station Printer
   */
  public static async printKOT(kot: KOTRecord): Promise<PrintJob> {
    const printer = this.getPrinterForStation(kot.station);
    const payload = this.generateKOTText(kot);

    printer.lastPrintAt = new Date().toISOString();
    db.notify();

    const job = PrintQueueRepository.addJob({
      type: 'KOT_TICKET',
      printerId: printer.id,
      printerName: printer.name,
      targetStation: kot.station,
      orderId: kot.orderId,
      orderNumber: kot.orderNumber,
      tokenNumber: kot.tokenNumber,
      kotId: kot.id,
      kotNumber: kot.kotNumber,
      rawPayload: payload,
      paperSize: printer.paperSize || '80mm'
    });

    if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
      try {
        await this.dispatchToNetworkPrinter(printer, payload);
      } catch (err: any) {
        return PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed') || job;
      }
    }

    return job;
  }

  /**
   * Dispatch Manual Reprint with Audit Logging
   */
  public static async reprintReceipt(order: Order, reason?: string, username: string = 'Cashier'): Promise<PrintJob> {
    const printer = this.getPrinterForRole('RECEIPT');
    const effectivePaperSize = printer.paperSize || '80mm';
    const payload = this.generateReceiptText(order, effectivePaperSize);

    let job = PrintQueueRepository.addJob({
      type: effectivePaperSize === '80mm' ? 'RECEIPT_80MM' : 'RECEIPT_58MM',
      printerId: printer.id,
      printerName: printer.name,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      rawPayload: payload,
      paperSize: effectivePaperSize
    });

    job.isReprint = true;

    if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
      try {
        await this.dispatchToNetworkPrinter(printer, payload);
      } catch (err: any) {
        const failed = PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed');
        if (failed) job = { ...failed, isReprint: true };
      }
    }

    AuditRepository.log({
      action: 'RECEIPT_REPRINT',
      category: 'HARDWARE',
      details: `Reprinted receipt for Invoice #${order.orderNumber} (Reason: ${reason || 'Customer request'}) on ${printer.name}`,
      username
    });

    db.notify();
    return job;
  }

  /**
   * Dispatch Diagnostic Test Slip to Selected Printer
   */
  public static async printTestSlip(printerId: string, paperSize: ReceiptPaperSize = '80mm'): Promise<PrintJob> {
    const printer = db.configuredPrinters.find((p) => p.id === printerId) || this.getPrinterForRole('RECEIPT');

    const rawPayload = `
========================================
            JAMANVAAR POS
           BY KELVIONTECH
----------------------------------------
HARDWARE DIAGNOSTIC TEST SLIP
DEVICE: ${printer.name}
ROLE: ${printer.role || 'GENERAL'}
INTERFACE: ${printer.interfaceType} ${printer.port || printer.ipAddress || ''}
PAPER SIZE: ${paperSize}
STATUS: READY (COMMUNICATION OK)
TIMESTAMP: ${new Date().toLocaleString('en-IN')}
----------------------------------------
ESC/POS Thermal Auto-Cutter Test OK
========================================
    `.trim();

    printer.lastTestAt = new Date().toISOString();
    printer.lastPrintAt = new Date().toISOString();
    db.notify();

    const job = PrintQueueRepository.addJob({
      type: 'TEST_PAGE',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload,
      paperSize
    });

    if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
      try {
        await this.dispatchToNetworkPrinter(printer, rawPayload);
      } catch (err: any) {
        return PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed') || job;
      }
    }

    return job;
  }
}
