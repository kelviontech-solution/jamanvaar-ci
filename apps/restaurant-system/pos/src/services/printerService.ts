import { db, PrintQueueRepository, ReceiptRepository, AuditRepository, PrinterRepository } from '@jamanvaar/database';
import { detectPrinters, describeDiscovered, isAlreadyConfigured, sendRawToPrinter, type DetectionResult, type DiscoveredPrinter } from '@jamanvaar/api';
import { Order, KOTRecord, PrintJob, ReceiptPaperSize, PrinterDevice, PrinterRole } from '@jamanvaar/types';

export class PosPrinterService {
  /**
   * Discovers all physical, network, and driver printers configured on this terminal
   */
  public static discoverPrinters(): PrinterDevice[] {
    return db.configuredPrinters;
  }

  /**
   * BUG-025: this used to set every already-configured printer to READY and report
   * "Found N printers (USB, LAN, Serial, Windows drivers)" without scanning anything. There is
   * no native code yet that can enumerate real printers (Windows spooler, USB, LAN port 9100),
   * so this reports only what is configured, changes no status, and says so plainly.
   */
  public static scanForPrinters(): {
    totalFound: number;
    printers: PrinterDevice[];
    canDetectNewHardware: boolean;
    note: string;
  } {
    return {
      totalFound: db.configuredPrinters.length,
      printers: db.configuredPrinters,
      canDetectNewHardware: false,
      note: 'Automatic printer detection is not available yet: add printers manually in Restaurant Admin. Statuses shown are the last known ones, not a live check.'
    };
  }

  /**
   * Real hardware detection (BUG-025/026), inside the desktop app: what Windows has installed (USB and
   * driver printers), what answers on the network's raw-print port, and what serial ports exist.
   * Returns `available: false` with an explanation in a browser tab, where none of this can be asked.
   */
  public static async detectHardwarePrinters(): Promise<DetectionResult> {
    return detectPrinters();
  }

  /** True when a discovered printer is not one of this restaurant's configured printers yet. */
  public static isNewDiscovery(found: DiscoveredPrinter): boolean {
    return !isAlreadyConfigured(db.configuredPrinters, found);
  }

  /** Adds a printer found by detection, with a role and paper size the operator chose for it. */
  public static addDiscoveredPrinter(found: DiscoveredPrinter, role: PrinterRole, paperSize: ReceiptPaperSize): PrinterDevice {
    const described = describeDiscovered(found);
    return PrinterRepository.createPrinter({ ...described, name: described.name || 'New printer', role, paperSize });
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

    // BUG-028: only the restaurant's real details are printed. No hardcoded brand/tagline
    // lines, and a missing GSTIN says so instead of a placeholder being printed on a tax invoice.
    const taxable = Math.max(0, (order.subtotal || 0) - (order.discountAmount || 0));
    const halfRate = (amount: number | undefined): string => {
      if (!taxable || !amount) return '0';
      const pct = Math.round(((amount / taxable) * 100) * 100) / 100;
      return String(pct);
    };
    const lines: string[] = [
      center(config.restaurantName.toUpperCase()),
      config.address ? center(config.address) : '',
      config.phone ? center(`Phone: ${config.phone}`) : '',
      center(config.gstin ? `GSTIN: ${config.gstin}` : 'GSTIN: Not registered'),
      config.fssaiNumber ? center(`FSSAI Lic: ${config.fssaiNumber}`) : '',
      doubleDivider,
      pad(`INVOICE: ${order.orderNumber}`, `TOKEN: #${order.tokenNumber}`),
      pad(`DATE: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, `TIME: ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`),
      pad(`CASHIER: ${order.cashierName || 'Unassigned'}`, order.tableNumber ? `TABLE: ${order.tableNumber}` : `TYPE: ${order.orderType}`),
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
    lines.push(pad(`CGST (${halfRate(order.cgstAmount)}%):`, `₹${order.cgstAmount || 0}`));
    lines.push(pad(`SGST (${halfRate(order.sgstAmount)}%):`, `₹${order.sgstAmount || 0}`));
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
  private static async dispatchToPrinter(printer: PrinterDevice, text: string): Promise<void> {
    await sendRawToPrinter(printer, this.wrapEscPos(text));
  }

  /**
   * A freshly activated real restaurant has no printers until the owner adds one (BUG-025).
   * Printing must fail cleanly with that reason - recorded as a FAILED job the cashier can
   * see and retry later - rather than crash the sale on `undefined.lastPrintAt`.
   */
  private static noPrinterJob(
    type: PrintJob['type'],
    payload: string,
    ref: { orderId?: string; orderNumber?: string; tokenNumber?: string; kotId?: string; kotNumber?: string; targetStation?: string }
  ): PrintJob {
    const job = PrintQueueRepository.addJob({
      type,
      printerId: 'no-printer',
      printerName: 'No printer configured',
      rawPayload: payload,
      ...ref
    });
    return PrintQueueRepository.updateJobStatus(job.id, 'FAILED', 'No printer is configured. Add one in Restaurant Admin → Printers.') || job;
  }

  /**
   * BUG-024/026: the one place every print job's real outcome is decided. `addJob` creates a
   * job PENDING (not SUCCESS) precisely so this is the only path that can mark it otherwise.
   * NETWORK_LAN inside the desktop app is the one real transport today; VIRTUAL_EMULATOR is an
   * explicit, dev-only simulator. Every other case — USB/SERIAL/WINDOWS_DRIVER (no native
   * driver exists yet) or NETWORK_LAN outside the desktop app — used to "simulate success"
   * and is now a real, explained failure instead.
   */
  private static async dispatchAndFinalize(job: PrintJob, printer: PrinterDevice, payload: string): Promise<PrintJob> {
    const stored = db.printJobs.find((j) => j.id === job.id);
    if (stored) stored.attempts += 1;
    try {
      // Real transports for network, USB / Windows printers and serial, in the desktop app; only the
      // developer simulator sends nothing.
      await this.dispatchToPrinter(printer, payload);
      return PrintQueueRepository.updateJobStatus(job.id, 'PRINTED') || job;
    } catch (err: any) {
      return PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed') || job;
    }
  }

  /**
   * Dispatch Receipt Print Job to Configured Receipt Printer
   */
  public static async printOrderReceipt(order: Order, paperSize?: ReceiptPaperSize): Promise<PrintJob> {
    const printer = this.getPrinterForRole('RECEIPT');
    if (!printer) {
      return this.noPrinterJob(
        paperSize === '58mm' ? 'RECEIPT_58MM' : 'RECEIPT_80MM',
        this.generateReceiptText(order, paperSize || '80mm'),
        { orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber }
      );
    }
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

    return this.dispatchAndFinalize(job, printer, payload);
  }

  /**
   * Dispatch KOT Print Job to Station Printer
   */
  public static async printKOT(kot: KOTRecord): Promise<PrintJob> {
    const printer = this.getPrinterForStation(kot.station);
    const payload = this.generateKOTText(kot);
    if (!printer) {
      return this.noPrinterJob('KOT_TICKET', payload, {
        orderId: kot.orderId, orderNumber: kot.orderNumber, tokenNumber: kot.tokenNumber,
        kotId: kot.id, kotNumber: kot.kotNumber, targetStation: kot.station
      });
    }

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

    return this.dispatchAndFinalize(job, printer, payload);
  }

  /**
   * BUG-024: Retry for a failed/pending job that actually re-sends it (the repository's
   * retryJob only re-queues; it used to just flip the job to SUCCESS).
   */
  public static async retryJob(jobId: string): Promise<PrintJob | null> {
    const queued = PrintQueueRepository.retryJob(jobId);
    if (!queued) return null;
    const printer = db.configuredPrinters.find((p) => p.id === queued.printerId) || this.getPrinterForRole('RECEIPT');
    return this.dispatchAndFinalize(queued, printer, queued.rawPayload || queued.formattedText || '');
  }

  /**
   * Dispatch Manual Reprint with Audit Logging
   */
  public static async reprintReceipt(order: Order, reason?: string, username: string = 'Cashier'): Promise<PrintJob> {
    const printer = this.getPrinterForRole('RECEIPT');
    if (!printer) {
      return this.noPrinterJob('RECEIPT_80MM', this.generateReceiptText(order, '80mm'), {
        orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber
      });
    }
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
    job = { ...(await this.dispatchAndFinalize(job, printer, payload)), isReprint: true };

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
    if (!printer) return this.noPrinterJob('TEST_PAGE', 'JAMANVAAR diagnostic test slip', {});

    // BUG-027: this used to bake a fixed "STATUS: READY (COMMUNICATION OK)" line into the
    // slip itself, sent to the printer before anything was actually attempted — nonsensical
    // (if communication weren't OK, the printer would never receive it to print it), and it
    // made the real result (the job's status, below) irrelevant to what the slip claimed.
    const rawPayload = [
      '========================================',
      '            JAMANVAAR POS',
      '----------------------------------------',
      'HARDWARE DIAGNOSTIC TEST SLIP',
      `DEVICE: ${printer.name}`,
      `ROLE: ${printer.role || 'GENERAL'}`,
      `INTERFACE: ${printer.interfaceType} ${printer.port || printer.ipAddress || ''}`,
      `PAPER SIZE: ${paperSize}`,
      `TIMESTAMP: ${new Date().toLocaleString('en-IN')}`,
      '========================================'
    ].join(String.fromCharCode(10));

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

    return this.dispatchAndFinalize(job, printer, rawPayload);
  }
}
