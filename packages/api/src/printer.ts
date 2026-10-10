import { KOTRecord, Order, PrinterDevice, PrinterHardwareStatus, PrinterRole, PrintJob, ReceiptConfig, ReceiptPaperSize } from '@jamanvaar/types';
import { Platform, ESC_POS_DRAWER_KICK } from './platform';
import { formatDate, formatINR, formatSplitTax, formatTime, generateUUID, stripControlCharsForPrint, restaurantGstRate, taxLabels, buildUpiPaymentUri, escPosQrBitmapBytes } from '@jamanvaar/utils';
import { AuditRepository, db, PrintQueueRepository, ReceiptRepository } from '@jamanvaar/database';

// B2-023: a kiosk order's `kioskId` is the real activation UUID (needed internally for device
// tracking), which used to print verbatim on the guest's own printed receipt
// ("TERMINAL: 11ea4a8b-e9a4-...") — meaningless and faintly alarming to a customer. Friendly
// labels (POS-01, KIOSK-01, ...) already print fine as-is; only a raw UUID gets swapped out.
const KIOSK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function friendlyTerminalLabel(kioskId: string | undefined): string {
  if (!kioskId) return 'KIOSK-01';
  return KIOSK_UUID_RE.test(kioskId) ? 'Self-Order Kiosk' : kioskId;
}

export class PrinterService {
  private static activePrinterId: string = 'prn-kiosk-01';
  /**
   * `queuePrintJob` fires a background `processQueue()` without awaiting it, so the UI is never blocked on
   * hardware; `printReceipt` then awaits its own `processQueue()` call to learn the real outcome. Without
   * this chain, that second call would see a run already in flight, return `{processed: 0, failed: 0}`
   * immediately, and let the caller read the job's status before the first run had actually finished
   * dispatching it. Chaining onto the in-flight run's promise (and re-running once more after it, to catch
   * anything queued while it was busy) means every caller's `await processQueue()` only resolves once the
   * queue is genuinely idle.
   */
  private static queueRun: Promise<{ processed: number; failed: number }> | null = null;

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
   * Retrieves configured physical printer for a specific operational role
   * (kitchen station routing). Same resolution order as the POS terminal's
   * printer service so a kitchen printer assignment behaves identically
   * regardless of which app the order originated from.
   */
  public static getPrinterForRole(role: PrinterRole): PrinterDevice {
    const found = db.configuredPrinters.find((p) => p.role === role && p.status === 'READY')
      || db.configuredPrinters.find((p) => p.role === role)
      || this.getActivePrinter();
    return found;
  }

  /**
   * Resolves the physical kitchen printer for a free-text station name
   * (e.g. "Tandoor Section", "Beverages Bar") the same way the POS KOT
   * router does, so a kiosk order's tickets land on the correct station
   * printer instead of always the kiosk's single receipt printer.
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
    return this.getPrinterForRole('KITCHEN');
  }

  /**
   * Formats a Kitchen Order Ticket for a single station's KOT, matching
   * the POS terminal's KOT layout so kitchen staff see one consistent
   * ticket format regardless of order origin.
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

    kot.items.forEach((item) => {
      lines.push(pad(item.name, `x${item.quantity}`));
      item.modifiers.forEach((mod) => lines.push(`  + ${mod.optionName}`));
      if (item.specialInstructions) lines.push(`  * ${item.specialInstructions}`);
    });

    if (kot.orderNotes) {
      lines.push(divider);
      lines.push('NOTE:');
      lines.push(kot.orderNotes);
    }

    lines.push(doubleDivider);
    return lines.join('\n');
  }

  /**
   * Dispatches a Kitchen Order Ticket to the correct station printer,
   * mirroring the POS terminal's KOT dispatch so kiosk orders route to
   * the same physical kitchen printers instead of only the kiosk's own
   * customer-facing receipt printer.
   */
  public static printKOT(kot: KOTRecord): PrintJob {
    const printer = this.getPrinterForStation(kot.station);
    const payload = this.generateKOTText(kot);

    if (!printer) {
      const failed = PrintQueueRepository.addJob({
        type: 'KOT_TICKET',
        printerId: 'no-printer',
        printerName: 'No printer configured',
        targetStation: kot.station,
        orderId: kot.orderId,
        orderNumber: kot.orderNumber,
        kotId: kot.id,
        kotNumber: kot.kotNumber,
        rawPayload: payload
      });
      return PrintQueueRepository.updateJobStatus(failed.id, 'FAILED', 'No printer is configured. Add one in Restaurant Admin → Printers.') || failed;
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
    // BUG-024: the job is PENDING until the real dispatch confirms; it used to be created
    // already-SUCCESS and never sent anywhere.
    void this.processQueue();
    return job;
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
    if (config.restaurantName) out += `${center(config.restaurantName)}\n`;
    if (config.address) out += `${center(config.address)}\n`;
    if (config.phone) out += `${center(`Phone: ${config.phone}`)}\n`;
    // B2-019: unlike the POS app's own copy of this receipt (already fixed for BUG-028), this
    // shared copy (used by every non-POS app: Restaurant Admin, Captain, KDS, Kiosk Admin, Kiosk
    // User) just omitted the GSTIN line entirely for a restaurant with none — a document titled
    // a tax invoice needs to say "GSTIN: Not registered", not go silent about it.
    out += `${center(config.gstin ? `GSTIN: ${config.gstin}` : 'GSTIN: Not registered')}\n`;
    if (config.fssaiNumber) out += `${center(`FSSAI Lic: ${config.fssaiNumber}`)}\n`;
    out += `${divider}\n`;

    // Order Header & Giant Token
    out += `${row(`ORDER #${order.orderNumber}`, `TOKEN #${order.tokenNumber}`)}\n`;
    out += `${row(formatDate(order.createdAt), formatTime(order.createdAt))}\n`;
    out += `${row(`TYPE: ${order.orderType}`, order.tableNumber ? `TABLE: ${order.tableNumber}` : 'COUNTER')}\n`;
    out += `${row(`TERMINAL: ${friendlyTerminalLabel(order.kioskId)}`, `PAID: ${order.paymentMethod}`)}\n`;
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
      // B2-036/B2-019: formatINR rounds each stored half independently (e.g. 5.5 -> "6" for
      // both), which can print CGST+SGST that no longer sum to TOTAL AMOUNT below. formatSplitTax
      // derives both from the already-rounded whole-rupee tax total instead.
      const { cgst, sgst } = formatSplitTax(order.taxAmount, order.cgstAmount, order.sgstAmount);
      // The rate printed is the restaurant's configured GST, not a fixed one.
      const labels = taxLabels(restaurantGstRate(db.taxGroups));
      out += `${row(`${labels.cgst}:`, cgst)}\n`;
      out += `${row(`${labels.sgst}:`, sgst)}\n`;
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
    const config = ReceiptRepository.getConfig();
    const text = this.generateReceiptText(order, config, paperSize);
    return this.wrapEscPos(text, this.upiQrPayloadFor(config, order.totalAmount));
  }

  /** The UPI payment URI for this order's exact total, or undefined when no UPI QR is configured. */
  private static upiQrPayloadFor(config: ReceiptConfig, amount: number): string | undefined {
    if (!config.showUpiQrOnReceipt || !config.upiId) return undefined;
    return buildUpiPaymentUri({
      vpa: config.upiId,
      payeeName: config.upiPayeeName || config.restaurantName || 'Restaurant',
      amount
    });
  }

  /**
   * Wraps already-formatted receipt/KOT text in real ESC/POS init + cut
   * command bytes. Factored out of generateEscPosBytecode so the print
   * queue's real network dispatch (see dispatchToNetworkPrinter) can wrap
   * a job's own formattedText directly, without regenerating it from an
   * Order the queue may not have (a KOT job never had one).
   */
  private static wrapEscPos(text: string, qrPayload?: string): Uint8Array {
    // B2-063: every free-text field that ends up on a receipt/KOT (dish name, customer name,
    // Chef Notes, ...) is concatenated into `text` upstream with no filtering — a name
    // containing a raw ESC/GS control-byte sequence (e.g. the standard "kick cash drawer"
    // command, 0x1B 0x70 0x00 0x19 0xFA) would be sent to the printer as a real command, not
    // just printed as text. This is the one place every receipt/KOT byte stream passes through
    // before hitting hardware, so stripping control characters here (rather than at each
    // individual free-text field) catches every current and future one.
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(stripControlCharsForPrint(text) + '\n\n');
    const qrBytes = qrPayload ? escPosQrBitmapBytes(qrPayload) : new Uint8Array(0);
    const trailerBytes = encoder.encode(qrPayload ? 'Scan to pay via UPI\n\n\n' : '\n\n\n');

    // ESC/POS Commands:
    // ESC @ (Initialize): 0x1B, 0x40
    // GS V 66 0 (Cut paper): 0x1D, 0x56, 0x42, 0x00
    const initCmd = new Uint8Array([0x1b, 0x40]);
    const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

    const fullPayload = new Uint8Array(initCmd.length + textBytes.length + qrBytes.length + trailerBytes.length + cutCmd.length);
    let offset = 0;
    fullPayload.set(initCmd, offset); offset += initCmd.length;
    fullPayload.set(textBytes, offset); offset += textBytes.length;
    fullPayload.set(qrBytes, offset); offset += qrBytes.length;
    fullPayload.set(trailerBytes, offset); offset += trailerBytes.length;
    fullPayload.set(cutCmd, offset);

    return fullPayload;
  }

  /**
   * True only inside an actual compiled Tauri desktop app — never in the
   * Vitest suite or a browser preview, which have no IPC bridge to a real
   * printer. Gates every real network-dispatch attempt in this file.
   */
  private static isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * Sends already-formatted text to a real NETWORK_LAN printer over raw TCP
   * (port 9100 by default — the standard raw-print port most networked
   * ESC/POS printers support), via the send_escpos_bytes Tauri command.
   */
  private static async dispatchToPrinter(printer: PrinterDevice, text: string, qrPayload?: string): Promise<void> {
    await Platform.printer.send(printer, this.wrapEscPos(text, qrPayload));
  }

  /**
   * Pops the cash drawer (connected to the receipt printer) through the printer port: local hardware, no
   * internet, and it reports why when it cannot rather than pretending.
   */
  public static async openCashDrawer(): Promise<{ success: boolean; message: string }> {
    try {
      const printer = this.getPrinterForRole('RECEIPT');
      await Platform.printer.send(printer, ESC_POS_DRAWER_KICK);
      return { success: true, message: 'Cash drawer opened' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not open the cash drawer' };
    }
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
      qrPayload: this.upiQrPayloadFor(config, order.totalAmount),
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
   * Processes the print queue asynchronously with retry and crash recovery (Sections 14-17).
   * Safe to call while a run is already in flight — see `queueRun` above: the call joins the current
   * run and then runs once more, so it always resolves only once every job pending at call time is settled.
   */
  public static async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.queueRun) {
      this.queueRun = this.queueRun.then(() => this.runQueueOnce());
      return this.queueRun;
    }
    this.queueRun = this.runQueueOnce().finally(() => {
      this.queueRun = null;
    });
    return this.queueRun;
  }

  private static async runQueueOnce(): Promise<{ processed: number; failed: number }> {
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

        // BUG-024/026: only a real transport may mark a job PRINTED. Every real interface has a real
        // transport in the desktop app (network, USB / Windows printer, serial); outside it the job
        // fails with that reason. Only the developer simulator (VIRTUAL_EMULATOR) sends nothing.
        await this.dispatchToPrinter(printer, job.formattedText || job.rawPayload || '', job.qrPayload);
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
    if (db.configuredPrinters.length === 0) {
      // A freshly activated restaurant has no printers until the owner adds one.
      return { success: false, message: 'No printer is configured. Add one in Restaurant Admin → Printers.' };
    }
    const result = this.queuePrintJob(order, false);
    if (result.job.status === 'PRINTED') {
      // Duplicate-print protection already found this order printed — nothing left to dispatch.
      return { success: true, message: result.message, text: result.job.formattedText };
    }

    // BUG-024: this used to report success purely from the printer's stored `status` flag,
    // regardless of whether the job actually printed. Wait for the real dispatch outcome.
    await this.processQueue();
    const finalJob = db.printJobs.find((j) => j.id === result.job.id) || result.job;
    const printed = finalJob.status === 'PRINTED';

    return {
      success: printed,
      message: printed
        ? `Receipt printed on ${this.getActivePrinter().name}`
        : finalJob.lastError || 'Receipt could not be printed; it is queued and available digitally.',
      text: finalJob.formattedText
    };
  }

  /**
   * Admin manual reprint trigger with full audit trail (Section 37)
   */
  public static async reprintReceipt(orderId: string, username: string = 'admin'): Promise<{ success: boolean; message: string }> {
    if (db.configuredPrinters.length === 0) {
      return { success: false, message: 'No printer is configured. Add one in Restaurant Admin → Printers.' };
    }
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
  /**
   * BUG-027: this used to send nothing anywhere and report success whenever the printer's
   * stored status flag merely wasn't OFFLINE/ERROR — "COMMUNICATION OK" with no communication
   * ever attempted. A test slip now goes through the exact same real dispatch path as a
   * receipt, and succeeds only when that dispatch actually confirms.
   */
  public static async printTestSlip(printerId?: string): Promise<{ success: boolean; message: string }> {
    if (db.configuredPrinters.length === 0) {
      return { success: false, message: 'No printer is configured. Add one in Restaurant Admin → Printers.' };
    }
    const printer = printerId ? db.configuredPrinters.find((p) => p.id === printerId) || this.getActivePrinter() : this.getActivePrinter();

    if (printer.status === 'OFFLINE' || printer.status === 'ERROR') {
      return {
        success: false,
        message: `Cannot print test slip: ${printer.name} is OFFLINE.`
      };
    }

    printer.lastTestAt = new Date().toISOString();
    db.notify();

    const job: PrintJob = {
      id: `prn-test-${generateUUID()}`,
      printerId: printer.id,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 1,
      formattedText: `JAMANVAAR — Diagnostic Test Slip\nPrinter: ${printer.name}\nInterface: ${printer.interfaceType}\nTime: ${new Date().toLocaleString('en-IN')}`,
      paperSize: printer.paperSize,
      createdAt: new Date().toISOString()
    };
    db.printJobs.unshift(job);

    await this.processQueue();
    const finalJob = db.printJobs.find((j) => j.id === job.id) || job;
    const printed = finalJob.status === 'PRINTED';

    return {
      success: printed,
      message: printed
        ? `Test slip printed on "${printer.name}"`
        : finalJob.lastError || `Could not reach "${printer.name}"`
    };
  }
}
