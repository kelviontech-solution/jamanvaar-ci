import type { PrinterDevice, PrinterHardwareStatus } from '@jamanvaar/types';

/**
 * How bytes actually reach a printer, and how printers are found (BUG-025 / BUG-026).
 *
 * The desktop shell (Tauri) does the native work: raw TCP, the Windows print spooler, serial ports, and
 * listing what is installed. Nothing here pretends: outside the desktop app every real printer type fails
 * with that reason, and a failure from the operating system reaches the caller unchanged.
 */
export interface NativePrintBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

/** True only inside a real compiled Tauri desktop app — checked synchronously, with no async work. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * The bridge to the desktop shell, or null in a browser tab or the test suite. Only actually imports the
 * Tauri API (an async module load) when `isTauriRuntime()` is true, so callers that resolve the bridge
 * themselves via `isTauriRuntime()` first never pay for — or wait on — a hop that was never going to
 * produce anything: a caller that fires a print job without awaiting it (the normal case, so the UI never
 * blocks on hardware) needs a printer known to be unreachable to fail in the same synchronous tick, the
 * same way a printer that IS reachable only ever resolves later once the OS actually answers.
 */
export async function nativeBridge(): Promise<NativePrintBridge | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return { invoke: (cmd, args) => invoke(cmd, args) };
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const DESKTOP_ONLY = (what: string) => `${what} needs the JAMANVAAR desktop app; it is not available in a browser tab.`;

/**
 * Sends raw ESC/POS bytes to a printer over its own interface. Resolves when the operating system accepted
 * the data; rejects with a readable reason otherwise. VIRTUAL_EMULATOR is the developer simulator and sends nothing.
 */
export async function sendRawToPrinter(printer: PrinterDevice, bytes: Uint8Array, bridge?: NativePrintBridge | null): Promise<void> {
  if (printer.interfaceType === 'VIRTUAL_EMULATOR') return;

  // Only actually await the bridge when there is real async work to do (isTauriRuntime() is synchronous);
  // outside the desktop app every branch below fails in the same tick it was called, not one microtask later.
  const resolved = bridge !== undefined ? bridge : isTauriRuntime() ? await nativeBridge() : null;
  const label = `"${printer.name}"`;
  const data = Array.from(bytes);

  if (printer.interfaceType === 'NETWORK_LAN') {
    if (!resolved) throw new Error(DESKTOP_ONLY('Network printing'));
    if (!printer.ipAddress) throw new Error(`No IP address configured for ${label}.`);
    return run(resolved, 'send_escpos_bytes', { ip: printer.ipAddress, port: Number(printer.port) || 9100, bytes: data });
  }

  if (printer.interfaceType === 'WINDOWS_DRIVER' || printer.interfaceType === 'USB') {
    if (!resolved) throw new Error(DESKTOP_ONLY('Printing to a USB or Windows printer'));
    if (!printer.systemPrinterName) {
      throw new Error(`Choose the Windows printer for ${label} in printer settings (it is the name shown in Windows under Printers & scanners).`);
    }
    return run(resolved, 'print_raw_system', { name: printer.systemPrinterName, bytes: data });
  }

  if (printer.interfaceType === 'SERIAL') {
    if (!resolved) throw new Error(DESKTOP_ONLY('Serial printing'));
    if (!printer.port) throw new Error(`Set the COM port for ${label} in printer settings (for example COM3).`);
    return run(resolved, 'print_serial', { port: printer.port, baud: printer.baudRate || 9600, bytes: data });
  }

  throw new Error(`${label} uses an interface this app does not support.`);
}

async function run(bridge: NativePrintBridge, cmd: string, args: Record<string, unknown>): Promise<void> {
  try {
    await bridge.invoke<void>(cmd, args);
  } catch (err) {
    throw new Error(messageOf(err));
  }
}

// ---- detection ----------------------------------------------------------------------------------------------

export type DiscoveredPrinter =
  | { kind: 'SYSTEM'; name: string; port: string; driver: string; status: PrinterHardwareStatus }
  | { kind: 'NETWORK'; ip: string; port: number }
  | { kind: 'SERIAL'; port: string };

export interface DetectionResult {
  /** False in a browser tab: there is nothing to ask. */
  available: boolean;
  note: string;
  system: Array<Extract<DiscoveredPrinter, { kind: 'SYSTEM' }>>;
  network: Array<Extract<DiscoveredPrinter, { kind: 'NETWORK' }>>;
  serial: string[];
  /** Sources that failed, with their reasons; the others are still reported. */
  errors: string[];
}

/** Printers that only make files or send faxes: they cannot print a receipt. */
const NOT_A_RECEIPT_PRINTER = /print to pdf|onenote|xps document writer|^fax\b|microsoft.*(pdf|xps)|send to/i;

const STATUSES: PrinterHardwareStatus[] = ['READY', 'OFFLINE', 'PAPER_OUT', 'ERROR', 'BUSY', 'UNKNOWN'];
const asStatus = (s: string): PrinterHardwareStatus => (STATUSES.includes(s as PrinterHardwareStatus) ? (s as PrinterHardwareStatus) : 'UNKNOWN');

export async function detectPrinters(bridge?: NativePrintBridge | null): Promise<DetectionResult> {
  const resolved = bridge !== undefined ? bridge : isTauriRuntime() ? await nativeBridge() : null;
  const empty: DetectionResult = { available: false, note: DESKTOP_ONLY('Finding printers'), system: [], network: [], serial: [], errors: [] };
  if (!resolved) return empty;

  const errors: string[] = [];
  const attempt = async <T,>(cmd: string, args: Record<string, unknown>, fallback: T): Promise<T> => {
    try {
      return await resolved.invoke<T>(cmd, args);
    } catch (err) {
      errors.push(messageOf(err));
      return fallback;
    }
  };
  const [rows, ips, ports] = await Promise.all([
    attempt<string[][]>('list_system_printers', {}, []),
    attempt<string[]>('scan_network_printers', {}, []),
    attempt<string[]>('list_serial_ports', {}, [])
  ]);

  return {
    available: true,
    note: 'Found by asking Windows and scanning your network. Turn a printer on and scan again if it is missing.',
    system: rows
      .filter((r) => r[0] && !NOT_A_RECEIPT_PRINTER.test(r[0]))
      .map((r) => ({ kind: 'SYSTEM' as const, name: r[0], port: r[1] ?? '', driver: r[2] ?? '', status: asStatus(r[3] ?? '') })),
    network: ips.map((ip) => ({ kind: 'NETWORK' as const, ip, port: 9100 })),
    serial: ports,
    errors
  };
}

/** The printer settings to save for something that was found. The person still picks its role and paper size. */
export function describeDiscovered(found: DiscoveredPrinter): Partial<PrinterDevice> {
  if (found.kind === 'NETWORK') {
    return { name: `Network printer ${found.ip}`, interfaceType: 'NETWORK_LAN', ipAddress: found.ip, port: String(found.port), modelName: 'Network thermal printer', status: 'READY' };
  }
  if (found.kind === 'SERIAL') {
    return { name: `Serial printer on ${found.port}`, interfaceType: 'SERIAL', port: found.port, baudRate: 9600, modelName: 'Serial thermal printer', status: 'UNKNOWN' };
  }
  const usb = /^usb/i.test(found.port);
  return {
    name: found.name,
    interfaceType: usb ? 'USB' : 'WINDOWS_DRIVER',
    systemPrinterName: found.name,
    driverName: found.driver,
    modelName: found.driver || found.name,
    port: found.port,
    status: found.status
  };
}

export function isAlreadyConfigured(existing: PrinterDevice[], found: DiscoveredPrinter): boolean {
  if (found.kind === 'NETWORK') return existing.some((p) => p.interfaceType === 'NETWORK_LAN' && p.ipAddress === found.ip && (Number(p.port) || 9100) === found.port);
  if (found.kind === 'SERIAL') return existing.some((p) => p.interfaceType === 'SERIAL' && p.port?.toUpperCase() === found.port.toUpperCase());
  return existing.some((p) => (p.interfaceType === 'USB' || p.interfaceType === 'WINDOWS_DRIVER') && p.systemPrinterName === found.name);
}
