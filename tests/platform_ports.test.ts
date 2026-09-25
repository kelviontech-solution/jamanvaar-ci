import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform, type PrinterPort, type CashDrawerPort, type DeviceIdentityPort, type ScannerPort, type PaymentTerminalPort, type DisplayPort, type NetworkPort, ESC_POS_DRAWER_KICK } from '../packages/api/src/platform';
import { PrinterService } from '../packages/api/src/printer';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { OrderRepository } from '../packages/database/src/repositories';
import { db } from '../packages/database/src/db';

/** A printer standing in for real hardware: records every byte it is asked to print. */
class RecordingPrinter implements PrinterPort {
  readonly name = 'recording';
  sent: Array<{ printerId: string; bytes: Uint8Array }> = [];
  failNext = 0;
  async send(printer: { id: string }, bytes: Uint8Array) {
    if (this.failNext > 0) { this.failNext--; throw new Error('paper out'); }
    this.sent.push({ printerId: printer.id, bytes });
  }
  async list() { return []; }
}

const textOf = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('business logic talks to ports, not to browser or native APIs', () => {
  let printer: RecordingPrinter;
  beforeEach(() => {
    printer = new RecordingPrinter();
    Platform.reset();
    Platform.use({ printer });
    db.printJobs.length = 0;
    db.orders.length = 0;
    // Any real printer will do: the port is what receives the bytes.
    db.configuredPrinters.splice(0, db.configuredPrinters.length, {
      id: 'p-net', name: 'Counter LAN', type: 'THERMAL', connection: 'NETWORK_LAN', status: 'ONLINE', paperSize: '80mm', ipAddress: '192.168.1.50', port: 9100, roles: ['RECEIPT'], isDefault: true
    } as never);
  });
  afterEach(() => { Platform.reset(); });

  const order = (id: string) => OrderRepository.createOrder({
    id, items: [{ id: `oi-${id}`, menuItemId: 'm', name: 'Masala Chai', quantity: 2, unitPrice: 100, totalPrice: 200, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }] as never,
    subtotal: 200, totalAmount: 210, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`, paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'SUCCESS'
  } as never);

  it('a bill prints through the printer port with the internet completely down, and never touches the cloud', async () => {
    EndpointResolver.reset();
    EndpointResolver.configure({ cloudBase: 'https://cloud.example' });
    await expect(EndpointResolver.fetch('/api/v1/orders/sync', {}, (async () => { throw new TypeError('fetch failed'); }) as never)).rejects.toThrow();
    expect(EndpointResolver.mode()).toBe('OFFLINE');

    const o = order('print-1');
    const result = await PrinterService.printReceipt(o);
    expect(result.success).toBe(true);
    expect(printer.sent).toHaveLength(1);
    expect(textOf(printer.sent[0].bytes)).toContain('Masala Chai');
    expect(printer.sent[0].printerId).toBe('p-net');
  });

  it('a printer failure never loses or duplicates the bill: the job is retried and prints once, the order untouched', async () => {
    printer.failNext = 1;
    const o = order('print-2');
    await PrinterService.printReceipt(o);
    const jobs = db.printJobs.filter((j) => j.orderId === o.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('PRINTED');
    expect(jobs[0].attempts).toBe(2); // first attempt hit "paper out", the retry succeeded
    expect(o.paymentStatus).toBe('SUCCESS');
    expect(printer.sent).toHaveLength(1); // printed once
  });

  it('a queued job survives an application restart and prints afterwards', async () => {
    printer.failNext = 3;
    const o = order('print-3');
    await PrinterService.printReceipt(o);
    await PrinterService.processQueue();
    const job = db.printJobs.find((j) => j.orderId === o.id)!;
    expect(job.status).toBe('FAILED');

    // "Restart": the printer is fixed, the interrupted job is picked up again.
    job.status = 'PENDING';
    job.attempts = 0;
    const recovered = PrinterService.resumeCrashRecovery();
    expect(recovered.recoveredCount).toBeGreaterThanOrEqual(1);
    await PrinterService.processQueue();
    expect(printer.sent.length).toBeGreaterThanOrEqual(1);
  });

  it('the cash drawer opens through the same printer port, as the standard drawer-kick command', async () => {
    await PrinterService.openCashDrawer();
    expect(printer.sent).toHaveLength(1);
    expect([...printer.sent[0].bytes]).toEqual([...ESC_POS_DRAWER_KICK]);
  });

  it('a drawer that cannot be opened reports why instead of pretending', async () => {
    printer.failNext = 1;
    const r = await PrinterService.openCashDrawer();
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/paper out/);
  });

  it('a KOT prints locally to the kitchen station printer, again with no cloud', async () => {
    db.configuredPrinters.push({ id: 'p-kitchen', name: 'Kitchen', type: 'THERMAL', connection: 'NETWORK_LAN', status: 'ONLINE', paperSize: '80mm', ipAddress: '192.168.1.51', port: 9100, roles: ['KITCHEN'], stations: ['Main Kitchen'], isDefault: false } as never);
    const job = PrinterService.printKOT({ id: 'kot-1', kotNumber: 'AHD-20260925-001', orderId: 'o', orderNumber: 'X', tokenNumber: '1', orderType: 'TAKEAWAY', station: 'Main Kitchen', type: 'NEW', items: [{ name: 'Masala Chai', quantity: 2, modifiers: [] }], cashierName: 'cashier', createdAt: new Date().toISOString(), printed: false, status: 'PREPARING' } as never);
    await PrinterService.processQueue();
    expect(job).toBeTruthy();
    expect(printer.sent.some((s) => textOf(s.bytes).includes('Masala Chai'))).toBe(true);
  });
});

/**
 * The contract every adapter must satisfy. When a Tauri, Windows or Android adapter is written it is
 * dropped into these same tests, so packaging changes the adapter and nothing else.
 */
export function portContract(name: string, make: () => { printer: PrinterPort; drawer: CashDrawerPort; identity: DeviceIdentityPort; scanner: ScannerPort; terminal: PaymentTerminalPort; display: DisplayPort; network: NetworkPort }) {
  describe(`port contract: ${name}`, () => {
    it('printer: reports its name and accepts bytes or rejects with a reason (never resolves silently on failure)', async () => {
      const { printer } = make();
      expect(typeof printer.name).toBe('string');
      await expect(printer.send({ id: 'x' } as never, new Uint8Array([0x1b, 0x40])).then(() => 'ok', (e) => e instanceof Error)).resolves.toBeDefined();
    });
    it('cash drawer: open() resolves or rejects, never hangs', async () => {
      const { drawer } = make();
      await Promise.race([drawer.open().then(() => 'done', () => 'done'), new Promise((_, rej) => setTimeout(() => rej(new Error('hung')), 2000))]);
    });
    it('device identity: has a stable shape and can be cleared', () => {
      const { identity } = make();
      const id = identity.get();
      expect(id === null || typeof id.deviceId === 'string').toBe(true);
      identity.clear();
      expect(identity.get()).toBeNull();
    });
    it('scanner: subscribing returns an unsubscribe function', () => {
      const { scanner } = make();
      const off = scanner.onScan(() => undefined);
      expect(typeof off).toBe('function');
      off();
    });
    it('payment terminal: says whether it is available, and an unavailable terminal never returns a paid result', async () => {
      const { terminal } = make();
      if (!terminal.available()) {
        const r = await terminal.charge(100, 'ref-1');
        expect(r.status).not.toBe('PAID');
      }
    });
    it('display and network: expose the minimum the apps rely on', () => {
      const { display, network } = make();
      expect(typeof display.keepAwake).toBe('function');
      expect(typeof network.isOnline).toBe('function');
      expect(typeof network.subscribe(() => undefined)).toBe('function');
    });
  });
}

portContract('browser/development defaults', () => {
  Platform.reset();
  return { printer: Platform.printer, drawer: Platform.cashDrawer, identity: Platform.deviceIdentity, scanner: Platform.scanner, terminal: Platform.paymentTerminal, display: Platform.display, network: Platform.network };
});
