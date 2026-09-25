import type { PrinterDevice } from '@jamanvaar/types';
import { sendRawToPrinter, detectPrinters } from './print_transport';
import { NetworkStatusService } from './services/network';

/**
 * The seam between the restaurant software and the machine it runs on.
 *
 * Business logic (billing, KOTs, payments, sync) never calls a browser API or a native API directly: it
 * uses these ports. Today's adapters are the development/browser ones, and the one native adapter that
 * already exists (the Tauri print bridge). Packaging later means providing Windows / Tauri / Android
 * adapters through `Platform.use(...)`, with tests/platform_ports.test.ts's `portContract` proving each
 * one behaves. No business rule changes when the shell changes.
 */

/** ESC p 0 25 250: pulse the cash-drawer connector on a receipt printer. */
export const ESC_POS_DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export interface PrinterPort {
  readonly name: string;
  /** Sends raw bytes to a printer. Resolves only when the hardware accepted them; rejects with the reason otherwise. */
  send(printer: PrinterDevice, bytes: Uint8Array): Promise<void>;
  /** Printers this machine can see (network, USB, spooler). */
  list(): Promise<PrinterDevice[]>;
}

export interface CashDrawerPort {
  open(): Promise<void>;
}

export interface NetworkPort {
  /** True when the machine believes it is connected (not proof the internet works; see EndpointResolver for that). */
  isOnline(): boolean;
  subscribe(fn: (online: boolean) => void): () => void;
}

export interface DeviceIdentity {
  restaurantId: string;
  branchId: string | null;
  deviceId: string;
  deviceType: string;
}

export interface DeviceIdentityPort {
  get(): DeviceIdentity | null;
  set(identity: DeviceIdentity): void;
  clear(): void;
}

export interface DisplayPort {
  /** Keeps the screen on (kitchen display, kiosk). Best effort. */
  keepAwake(on: boolean): void;
}

export interface ScannerPort {
  onScan(handler: (code: string) => void): () => void;
}

export type TerminalResult = { status: 'PAID' | 'DECLINED' | 'UNAVAILABLE' | 'CANCELLED'; reference?: string; reason?: string };

export interface PaymentTerminalPort {
  available(): boolean;
  charge(amountRupees: number, reference: string): Promise<TerminalResult>;
}

// ---------------------------------------------------------------- default (development/browser) adapters

/** Prints through the desktop shell's native bridge when there is one; outside it every real printer fails with that reason. */
export class NativeBridgePrinterAdapter implements PrinterPort {
  readonly name = 'native-bridge';
  send(printer: PrinterDevice, bytes: Uint8Array): Promise<void> {
    return sendRawToPrinter(printer, bytes);
  }
  async list(): Promise<PrinterDevice[]> {
    const found = await detectPrinters();
    return (found as unknown as { printers?: PrinterDevice[] }).printers ?? [];
  }
}

/** Opens the drawer by sending the standard kick command to the active receipt printer. */
class PrinterKickCashDrawer implements CashDrawerPort {
  async open(): Promise<void> {
    const { PrinterService } = await import('./printer'); // loaded lazily: printer.ts itself uses this file
    const result = await PrinterService.openCashDrawer();
    if (!result.success) throw new Error(result.message);
  }
}

class BrowserNetwork implements NetworkPort {
  isOnline() {
    return NetworkStatusService.isOnline();
  }
  subscribe(fn: (online: boolean) => void) {
    return NetworkStatusService.subscribe((s) => fn(s === 'ONLINE' || s === 'SYNCING'));
  }
}

const IDENTITY_KEY = 'jamanvaar_device_identity';

class LocalStorageIdentity implements DeviceIdentityPort {
  get(): DeviceIdentity | null {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as DeviceIdentity) : null;
    } catch {
      return null;
    }
  }
  set(identity: DeviceIdentity): void {
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      // storage unavailable
    }
  }
  clear(): void {
    try {
      localStorage.removeItem(IDENTITY_KEY);
    } catch {
      // storage unavailable
    }
  }
}

class WakeLockDisplay implements DisplayPort {
  private lock: { release(): Promise<void> } | null = null;
  keepAwake(on: boolean): void {
    const wl = typeof navigator !== 'undefined' ? (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock : undefined;
    if (!wl) return;
    if (on) void wl.request('screen').then((l) => (this.lock = l)).catch(() => undefined);
    else void this.lock?.release().catch(() => undefined);
  }
}

/** A keyboard-wedge scanner: a burst of fast keystrokes ending in Enter. */
class KeyboardWedgeScanner implements ScannerPort {
  onScan(handler: (code: string) => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    let buffer = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - last > 80) buffer = '';
      last = now;
      if (e.key === 'Enter') {
        if (buffer.length >= 4) handler(buffer);
        buffer = '';
      } else if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }
}

/** No physical card terminal: honestly unavailable, and never reports a payment. */
class NoPaymentTerminal implements PaymentTerminalPort {
  available() {
    return false;
  }
  async charge(): Promise<TerminalResult> {
    return { status: 'UNAVAILABLE', reason: 'No card terminal is connected to this device.' };
  }
}

export class Platform {
  static printer: PrinterPort = new NativeBridgePrinterAdapter();
  static cashDrawer: CashDrawerPort = new PrinterKickCashDrawer();
  static network: NetworkPort = new BrowserNetwork();
  static deviceIdentity: DeviceIdentityPort = new LocalStorageIdentity();
  static display: DisplayPort = new WakeLockDisplay();
  static scanner: ScannerPort = new KeyboardWedgeScanner();
  static paymentTerminal: PaymentTerminalPort = new NoPaymentTerminal();

  /** Installs adapters for the current platform (a packaged shell calls this once at startup; tests use fakes). */
  static use(adapters: Partial<{ printer: PrinterPort; cashDrawer: CashDrawerPort; network: NetworkPort; deviceIdentity: DeviceIdentityPort; display: DisplayPort; scanner: ScannerPort; paymentTerminal: PaymentTerminalPort }>): void {
    if (adapters.printer) this.printer = adapters.printer;
    if (adapters.cashDrawer) this.cashDrawer = adapters.cashDrawer;
    if (adapters.network) this.network = adapters.network;
    if (adapters.deviceIdentity) this.deviceIdentity = adapters.deviceIdentity;
    if (adapters.display) this.display = adapters.display;
    if (adapters.scanner) this.scanner = adapters.scanner;
    if (adapters.paymentTerminal) this.paymentTerminal = adapters.paymentTerminal;
  }

  static reset(): void {
    this.printer = new NativeBridgePrinterAdapter();
    this.cashDrawer = new PrinterKickCashDrawer();
    this.network = new BrowserNetwork();
    this.deviceIdentity = new LocalStorageIdentity();
    this.display = new WakeLockDisplay();
    this.scanner = new KeyboardWedgeScanner();
    this.paymentTerminal = new NoPaymentTerminal();
  }
}
