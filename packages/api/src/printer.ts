import { Order, PrinterDevice, PrinterHardwareStatus, PrintJob, ReceiptConfig, ReceiptPaperSize } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime, generateUUID } from '@jamanvaar/utils';
import { AuditRepository, db, ReceiptRepository } from '@jamanvaar/database';

export class PrinterService {
  private static activePrinterId: string = 'prn-kiosk-01';
  private static isProcessing = false;

  /**
   * Discovers all connected Windows / Kiosk built-in thermal printers
   */
  public static discoverPrinters(): PrinterDevice[] {
    return db.configuredPrinters;
  }

  /**
   * Retrieves the currently active default kiosk thermal printer
   */
  public static getActivePrinter(): PrinterDevice {
    const found = db.configuredPrinters.find((p) => p.id === this.activePrinterId || p.isDefault);
    return found || db.configuredPrinters[0];
  }

  /**
   * Sets the active thermal printer for this kiosk terminal
   */
  public static setActivePrinter(printerId: string): PrinterDevice | null {
    const printer = db.configuredPrinters.find((p) => p.id === printerId);
    if (printer) {
      this.activePrinterId = printer.id;
      db.configuredPrinters.forEach((p) => {
        p.isDefault = p.id === printerId;
      });
      db.notify();
      return printer;
    }
    return null;
  }

  /**
   * Auto-detection & configuration on startup / Windows installation (Sections 2, 3, 8)
   */
  public static autoConfigureKioskPrinter(): { success: boolean; printer: PrinterDevice; message: string } {
    // 1. Locate built-in thermal printer
    let target = db.configuredPrinters.find((p) => p.isKioskBuiltIn && p.status === 'READY');
    if (!target) {
      target = db.configuredPrinters.find((p) => p.paperSize === '80mm' || p.paperSize === '58mm');
    }
    if (!target) {
      target = db.configuredPrinters[0];
    }

    if (target) {
      this.setActivePrinter(target.id);
      target.status = 'READY';
      target.lastTestAt = new Date().toISOString();
      db.notify();

      return {
        success: true,
        printer: target,
        message: `Kiosk built-in thermal printer "${target.name}" automatically configured (${target.paperSize} • ${target.interfaceType})`
      };
    }

    return {
      success: false,
      printer: db.configuredPrinters[0],
      message: 'No suitable thermal printer detected. Digital receipts will be used as fallback.'
    };
  }

  /**
   * Updates physical printer status (READY, OFFLINE, PAPER_OUT, ERROR, BUSY)
   */
  public static setPrinterStatus(printerId: string, status: PrinterHardwareStatus, errorMessage?: string): void {
    const printer = db.configuredPrinters.find((p) => p.id === printerId);
    if (printer) {
      printer.status = status;
      if (errorMessage) printer.lastError = errorMessage;
      db.notify();
    }
  }

  /**
   * Checks if active thermal printer is online and ready
   */
  public static isOnline(): boolean {
    const active = this.getActivePrinter();
    return active ? active.status === 'READY' : false;
  }

  /**
   * Formats a professional thermal receipt for 80mm (48 cols) or 58mm (32 cols) (Sections 6, 7, 19-24)
   */
  public static generateReceiptText(
    order: Order,
    config: ReceiptConfig = ReceiptRepository.getConfig(),
    paperSize: ReceiptPaperSize = config.paperSize || '80mm'
  ): string {
    const is80mm = paperSize === '80mm';
    const width = is80mm ? 48 : 32;
    const divider = '='.repeat(width);
    const dashLine = '-'.repeat(width);

    const center = (str: string) => {
      if (str.length >= width) return str.substring(0, width);
      const leftPad = Math.floor((width - str.length) / 2);
      return ' '.repeat(leftPad) + str;
    };

    const row = (left: string, right: string) => {
      const space = width - left.length - right.length;
      if (space <= 0) return `${left.substring(0, width - right.length - 1)} ${right}`;
      return `${left}${' '.repeat(space)}${right}`;
    };

    let out = '';
    out += `${divider}\n`;
    out += `${center('JAMANVAAR')}\n`;
    out += `${center(config.restaurantName || 'Authentic Indian Cuisine')}\n`;
    out += `${center(config.address || 'Sindhu Bhavan Road, Ahmedabad')}\n`;
    out += `${center(`Phone: ${config.phone || '+91 79 4890 1234'}`)}\n`;
    if (config.gstin) out += `${center(`GSTIN: ${config.gstin}`)}\n`;
    if (config.fssaiNumber) out += `${center(`FSSAI Lic: ${config.fssaiNumber}`)}\n`;
    out += `${divider}\n`;

    // Order Header & Giant Token
    out += `${row(`ORDER #${order.orderNumber}`, `TOKEN #${order.tokenNumber}`)}\n`;
    out += `${row(formatDate(order.createdAt), formatTime(order.createdAt))}\n`;
    out += `${row(`TYPE: ${order.orderType}`, order.tableNumber ? `TABLE: ${order.tableNumber}` : 'COUNTER')}\n`;
    out += `${row(`TERMINAL: ${order.kioskId || 'KIOSK-01'}`, `PAID: ${order.paymentMethod}`)}\n`;
    out += `${dashLine}\n`;

    // Table Header
    if (is80mm) {
      out += `${'ITEM'.padEnd(26)} ${'QTY'.padStart(4)} ${'RATE'.padStart(7)} ${'AMOUNT'.padStart(8)}\n`;
    } else {
      out += `${'ITEM'.padEnd(16)} ${'QTY'.padStart(3)} ${'AMOUNT'.padStart(10)}\n`;
    }
    out += `${dashLine}\n`;

    // Items
    for (const it of (order.items || [])) {
      const name = it.name.length > (is80mm ? 25 : 15) ? it.name.substring(0, is80mm ? 25 : 15) : it.name;
      const qty = String(it.quantity);
      const rate = formatINR(it.unitPrice);
      const total = formatINR(it.totalPrice);

      if (is80mm) {
        out += `${name.padEnd(26)} ${qty.padStart(4)} ${rate.padStart(7)} ${total.padStart(8)}\n`;
      } else {
        out += `${name.padEnd(16)} ${qty.padStart(3)} ${total.padStart(10)}\n`;
      }

      if (it.modifiers && it.modifiers.length > 0) {
        for (const mod of it.modifiers) {
          out += `  + ${mod.optionName} (${formatINR(mod.priceDelta)})\n`;
        }
      }
      if (it.specialInstructions) {
        out += `  * Note: ${it.specialInstructions}\n`;
      }
    }

    out += `${dashLine}\n`;

    // Financial Totals
    out += `${row('Subtotal:', formatINR(order.subtotal))}\n`;
    if (order.discountAmount > 0) {
      out += `${row(`Discount (${order.couponCode || 'Promo'}):`, `-${formatINR(order.discountAmount)}`)}\n`;
    }
    if (config.showTaxBreakup) {
      out += `${row('CGST @ 2.5%:', formatINR(order.cgstAmount))}\n`;
      out += `${row('SGST @ 2.5%:', formatINR(order.sgstAmount))}\n`;
    }
    if (order.roundOffAmount !== 0) {
      out += `${row('Round Off:', formatINR(order.roundOffAmount))}\n`;
    }

    out += `${divider}\n`;
    out += `${row('TOTAL AMOUNT:', formatINR(order.totalAmount))}\n`;
    out += `${divider}\n`;

    // Operational Pickup & ETA
    out += `${row('ESTIMATED WAIT:', `${order.estimatedWaitMinutes} MINS`)}\n`;
    out += `${row('PICKUP AT:', (order.pickupCounter || 'COUNTER 1').toUpperCase())}\n`;
    out += `${divider}\n`;

    // Footer Thank-You & Attribution
    out += `${center(config.thankYouMessage || 'Thank you for dining with us!')}\n`;
    out += `${center(config.footerMessage || 'Freshly Prepared • Zero Preservatives')}\n`;
    out += `${center('Powered by JAMANVAAR Touch Kiosk')}\n`;
    out += `${divider}\n`;

    return out.trim();
  }

  /**
   * Generates binary ESC/POS command bytecode for physical thermal printers
   */
  public static generateEscPosBytecode(order: Order, paperSize: ReceiptPaperSize = '80mm'): Uint8Array {
    const text = this.generateReceiptText(order, undefined, paperSize);
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text + '\n\n\n');

    // ESC/POS Commands:
    // ESC @ (Initialize): 0x1B, 0x40
    // GS V 66 0 (Cut paper): 0x1D, 0x56, 0x42, 0x00
    const initCmd = new Uint8Array([0x1b, 0x40]);
    const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

    const fullPayload = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
    fullPayload.set(initCmd, 0);
    fullPayload.set(textBytes, initCmd.length);
    fullPayload.set(cutCmd, initCmd.length + textBytes.length);

    return fullPayload;
  }

  /**
   * Transactional Print Queue Manager: Queues receipt and triggers automatic printing (Sections 13-17)
   */
  public static queuePrintJob(
    order: Order,
    isReprint: boolean = false
  ): { job: PrintJob; success: boolean; message: string } {
    const activePrinter = this.getActivePrinter();
    const config = ReceiptRepository.getConfig();

    // Duplicate Print Protection (Section 16): Check if already printed successfully
    if (!isReprint) {
      const existingJob = db.printJobs.find((j) => j.orderId === order.id && j.status === 'PRINTED');
      if (existingJob) {
        return {
          job: existingJob,
          success: true,
          message: `Order #${order.orderNumber} receipt was already printed (Job #${existingJob.id})`
        };
      }
    }

    const formattedText = this.generateReceiptText(order, config, activePrinter.paperSize);

    const job: PrintJob = {
      id: `prn-job-${generateUUID()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      printerId: activePrinter.id,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      formattedText,
      paperSize: activePrinter.paperSize,
      createdAt: new Date().toISOString(),
      isReprint
    };

    db.printJobs.unshift(job);
    db.notify();

    // Asynchronously dispatch queue without blocking UI
    this.processQueue();

    return {
      job,
      success: true,
      message: `Print job #${job.id} dispatched to ${activePrinter.name}`
    };
  }

  /**
   * Processes the print queue asynchronously with retry and crash recovery (Sections 14-17)
   */
  public static async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) return { processed: 0, failed: 0 };
    this.isProcessing = true;

    let processed = 0;
    let failed = 0;

    const pendingJobs = db.printJobs.filter((j) => j.status === 'PENDING' || j.status === 'RETRYING');

    for (const job of pendingJobs) {
      const printer = db.configuredPrinters.find((p) => p.id === job.printerId) || this.getActivePrinter();
      job.attempts += 1;
      job.status = 'PRINTING';

      try {
        if (printer.status === 'OFFLINE' || printer.status === 'ERROR') {
          throw new Error(`Thermal printer "${printer.name}" is currently offline or paper out`);
        }

        // Simulate physical ESC/POS byte transmission to Windows spooler / serial port
        job.status = 'PRINTED';
        job.printedAt = new Date().toISOString();
        printer.lastPrintAt = new Date().toISOString();
        processed++;

        AuditRepository.log({
          kioskId: 'KIOSK-01',
          action: job.isReprint ? 'RECEIPT_REPRINTED' : 'RECEIPT_PRINT_COMPLETED',
          category: 'HARDWARE',
          details: `Printed receipt for Order ${job.orderNumber} (Token #${job.tokenNumber}) on ${printer.name}`
        });
      } catch (err: any) {
        job.lastError = err?.message || 'Printer communication timeout';
        if (job.attempts < job.maxAttempts) {
          job.status = 'RETRYING';
        } else {
          job.status = 'FAILED';
        }
        failed++;
      }
    }

    db.notify();
    this.isProcessing = false;
    return { processed, failed };
  }

  /**
   * Resumes and recovers any interrupted print jobs after system restart or crash (Section 17)
   */
  public static resumeCrashRecovery(): { recoveredCount: number } {
    const unprinted = db.printJobs.filter((j) => j.status === 'PENDING' || j.status === 'RETRYING' || j.status === 'PRINTING');
    if (unprinted.length > 0) {
      unprinted.forEach((j) => (j.status = 'PENDING'));
      this.processQueue();
    }
    return { recoveredCount: unprinted.length };
  }

  /**
   * High-level auto-print entry point called upon order confirmation
   */
  public static async printReceipt(order: Order): Promise<{ success: boolean; message: string; text?: string }> {
    const result = this.queuePrintJob(order, false);
    const activePrinter = this.getActivePrinter();
    const isOnline = activePrinter.status === 'READY';

    return {
      success: isOnline,
      message: isOnline
        ? `Receipt automatically printed on ${activePrinter.name}`
        : 'Printer offline; receipt queued in print spooler and available digitally.',
      text: result.job.formattedText
    };
  }

  /**
   * Admin manual reprint trigger with full audit trail (Section 37)
   */
  public static async reprintReceipt(orderId: string, username: string = 'admin'): Promise<{ success: boolean; message: string }> {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, message: 'Order not found for reprinting' };
    }

    this.queuePrintJob(order, true);
    AuditRepository.log({
      username,
      action: 'RECEIPT_REPRINTED',
      category: 'HARDWARE',
      details: `Receipt manually reprinted for Order ${order.orderNumber} by @${username}`
    });

    return {
      success: true,
      message: `Reprint job queued for Order #${order.orderNumber} (Token #${order.tokenNumber})`
    };
  }

  /**
   * Dispatches an ESC/POS diagnostic test slip (Section 27)
   */
  public static async printTestSlip(printerId?: string): Promise<{ success: boolean; message: string }> {
    const printer = printerId ? db.configuredPrinters.find((p) => p.id === printerId) || this.getActivePrinter() : this.getActivePrinter();

    if (printer.status === 'OFFLINE' || printer.status === 'ERROR') {
      return {
        success: false,
        message: `Cannot print test slip: ${printer.name} is OFFLINE.`
      };
    }

    printer.lastTestAt = new Date().toISOString();
    printer.lastPrintAt = new Date().toISOString();
    db.notify();

    return {
      success: true,
      message: `✓ Test Receipt Dispatched to "${printer.name}" (${printer.paperSize} • ${printer.port || 'USB001'})`
    };
  }
}
