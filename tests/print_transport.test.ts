import { describe, it, expect, vi } from 'vitest';
import type { PrinterDevice } from '@jamanvaar/types';
import { sendRawToPrinter, detectPrinters, describeDiscovered, isAlreadyConfigured, type NativePrintBridge } from '../packages/api/src/print_transport';

/**
 * BUG-025 / BUG-026: only raw network printing was real. USB and Windows-driver printers (the common case at a
 * counter) and serial printers reported success without sending anything, and nothing could detect printers.
 * Each interface now has a real transport in the desktop app, and detection asks the operating system.
 */
const base: PrinterDevice = {
  id: 'p1',
  name: 'Counter',
  interfaceType: 'NETWORK_LAN',
  paperSize: '80mm',
  status: 'READY',
  isDefault: false,
  isKioskBuiltIn: false,
  modelName: 'X'
};
const bytes = new Uint8Array([0x1b, 0x40, 0x41, 0x0a]);

function bridge(handlers: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  const b: NativePrintBridge = {
    invoke: async <T,>(cmd: string, args: Record<string, unknown> = {}) => {
      calls.push({ cmd, args });
      const h = handlers[cmd];
      if (!h) throw new Error(`no handler for ${cmd}`);
      return h(args) as T;
    }
  };
  return { b, calls };
}

describe('sending to a printer (BUG-026)', () => {
  it('network printers go over raw TCP to their address and port', async () => {
    const { b, calls } = bridge({ send_escpos_bytes: () => undefined });
    await sendRawToPrinter({ ...base, ipAddress: '192.168.1.150', port: '9100' }, bytes, b);
    expect(calls).toEqual([{ cmd: 'send_escpos_bytes', args: { ip: '192.168.1.150', port: 9100, bytes: [0x1b, 0x40, 0x41, 0x0a] } }]);
  });

  it('a network printer with no address fails with that reason', async () => {
    const { b, calls } = bridge();
    await expect(sendRawToPrinter(base, bytes, b)).rejects.toThrow(/IP address/i);
    expect(calls).toEqual([]);
  });

  it.each(['WINDOWS_DRIVER', 'USB'] as const)('a %s printer prints through its Windows printer queue', async (interfaceType) => {
    const { b, calls } = bridge({ print_raw_system: () => undefined });
    await sendRawToPrinter({ ...base, interfaceType, systemPrinterName: 'EPSON TM-T82 Receipt' }, bytes, b);
    expect(calls).toEqual([{ cmd: 'print_raw_system', args: { name: 'EPSON TM-T82 Receipt', bytes: [0x1b, 0x40, 0x41, 0x0a] } }]);
  });

  it.each(['WINDOWS_DRIVER', 'USB'] as const)('a %s printer without a chosen Windows printer fails and asks for one', async (interfaceType) => {
    const { b, calls } = bridge();
    await expect(sendRawToPrinter({ ...base, interfaceType }, bytes, b)).rejects.toThrow(/choose the windows printer/i);
    expect(calls).toEqual([]);
  });

  it('a serial printer prints to its COM port at its speed (9600 by default)', async () => {
    const { b, calls } = bridge({ print_serial: () => undefined });
    await sendRawToPrinter({ ...base, interfaceType: 'SERIAL', port: 'COM3' }, bytes, b);
    await sendRawToPrinter({ ...base, interfaceType: 'SERIAL', port: 'COM4', baudRate: 19200 }, bytes, b);
    expect(calls.map((c) => c.args.port)).toEqual(['COM3', 'COM4']);
    expect(calls.map((c) => c.args.baud)).toEqual([9600, 19200]);
    await expect(sendRawToPrinter({ ...base, interfaceType: 'SERIAL' }, bytes, b)).rejects.toThrow(/COM port/i);
  });

  it('outside the desktop app every real printer fails and says why', async () => {
    for (const interfaceType of ['NETWORK_LAN', 'WINDOWS_DRIVER', 'USB', 'SERIAL'] as const) {
      await expect(sendRawToPrinter({ ...base, interfaceType, ipAddress: '1.2.3.4', systemPrinterName: 'X', port: 'COM1' }, bytes, null)).rejects.toThrow(/desktop app/i);
    }
  });

  it('the developer simulator prints nothing and does not need the desktop app', async () => {
    const { b, calls } = bridge();
    await expect(sendRawToPrinter({ ...base, interfaceType: 'VIRTUAL_EMULATOR' }, bytes, b)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("the operating system's own error reaches the caller", async () => {
    const b: NativePrintBridge = { invoke: vi.fn().mockRejectedValue('Printing to "Kitchen" failed: the printer is offline') };
    await expect(sendRawToPrinter({ ...base, interfaceType: 'WINDOWS_DRIVER', systemPrinterName: 'Kitchen' }, bytes, b)).rejects.toThrow(/printer is offline/);
  });
});

describe('finding printers (BUG-025)', () => {
  it('asks the system for installed printers, the network for raw-print devices, and the serial ports', async () => {
    const { b, calls } = bridge({
      list_system_printers: () => [
        ['EPSON TM-T82 Receipt', 'USB001', 'EPSON TM-T82 ReceiptE4', 'READY'],
        ['Microsoft Print to PDF', 'PORTPROMPT:', 'Microsoft Print To PDF', 'READY'],
        ['Kitchen', 'IP_192.168.1.150', 'Generic / Text Only', 'OFFLINE']
      ],
      scan_network_printers: () => ['192.168.1.150', '192.168.1.151'],
      list_serial_ports: () => ['COM3']
    });
    const found = await detectPrinters(b);
    expect(found.available).toBe(true);
    expect(calls.map((c) => c.cmd).sort()).toEqual(['list_serial_ports', 'list_system_printers', 'scan_network_printers']);
    expect(found.system.map((p) => p.name)).toEqual(['EPSON TM-T82 Receipt', 'Kitchen']);
    expect(found.network.map((n) => n.ip)).toEqual(['192.168.1.150', '192.168.1.151']);
    expect(found.serial).toEqual(['COM3']);
    expect(found.errors).toEqual([]);
  });

  it('leaves out virtual printers that cannot take raw receipts (PDF, OneNote, XPS, fax)', async () => {
    const { b } = bridge({
      list_system_printers: () => [['Microsoft Print to PDF', 'PORTPROMPT:', 'x', 'READY'], ['OneNote (Desktop)', 'nul:', 'x', 'READY'], ['Microsoft XPS Document Writer', 'XPSPort:', 'x', 'READY'], ['Fax', 'SHRFAX:', 'x', 'READY'], ['Bar', 'USB002', 'Generic', 'READY']],
      scan_network_printers: () => [],
      list_serial_ports: () => []
    });
    expect((await detectPrinters(b)).system.map((p) => p.name)).toEqual(['Bar']);
  });

  it('one failing source does not hide the others, and its reason is reported', async () => {
    const { b } = bridge({
      list_system_printers: () => {
        throw new Error('Windows could not list printers');
      },
      scan_network_printers: () => ['192.168.1.9'],
      list_serial_ports: () => []
    });
    const found = await detectPrinters(b);
    expect(found.network.map((n) => n.ip)).toEqual(['192.168.1.9']);
    expect(found.errors.join(' ')).toMatch(/Windows could not list printers/);
  });

  it('in a browser there is nothing to detect and it says so', async () => {
    const found = await detectPrinters(null);
    expect(found.available).toBe(false);
    expect(found.system).toEqual([]);
    expect(found.note).toMatch(/desktop app/i);
  });

  it('a discovered printer becomes a configured one with the right interface', () => {
    const usb = describeDiscovered({ kind: 'SYSTEM', name: 'EPSON TM-T82 Receipt', port: 'USB001', driver: 'EPSON TM-T82 ReceiptE4', status: 'READY' });
    expect(usb).toMatchObject({ interfaceType: 'USB', systemPrinterName: 'EPSON TM-T82 Receipt', name: 'EPSON TM-T82 Receipt', modelName: 'EPSON TM-T82 ReceiptE4' });
    const driver = describeDiscovered({ kind: 'SYSTEM', name: 'Kitchen', port: 'IP_192.168.1.150', driver: 'Generic / Text Only', status: 'OFFLINE' });
    expect(driver).toMatchObject({ interfaceType: 'WINDOWS_DRIVER', status: 'OFFLINE' });
    const net = describeDiscovered({ kind: 'NETWORK', ip: '192.168.1.150', port: 9100 });
    expect(net).toMatchObject({ interfaceType: 'NETWORK_LAN', ipAddress: '192.168.1.150', port: '9100' });
    const serial = describeDiscovered({ kind: 'SERIAL', port: 'COM3' });
    expect(serial).toMatchObject({ interfaceType: 'SERIAL', port: 'COM3', baudRate: 9600 });
  });

  it('knows which discovered printers the restaurant has already added', () => {
    const existing: PrinterDevice[] = [
      { ...base, id: 'a', interfaceType: 'NETWORK_LAN', ipAddress: '192.168.1.150', port: '9100' },
      { ...base, id: 'b', interfaceType: 'USB', systemPrinterName: 'EPSON TM-T82 Receipt' },
      { ...base, id: 'c', interfaceType: 'SERIAL', port: 'COM3' }
    ];
    expect(isAlreadyConfigured(existing, { kind: 'NETWORK', ip: '192.168.1.150', port: 9100 })).toBe(true);
    expect(isAlreadyConfigured(existing, { kind: 'NETWORK', ip: '192.168.1.151', port: 9100 })).toBe(false);
    expect(isAlreadyConfigured(existing, { kind: 'SYSTEM', name: 'EPSON TM-T82 Receipt', port: 'USB001', driver: '', status: 'READY' })).toBe(true);
    expect(isAlreadyConfigured(existing, { kind: 'SYSTEM', name: 'Other', port: 'USB002', driver: '', status: 'READY' })).toBe(false);
    expect(isAlreadyConfigured(existing, { kind: 'SERIAL', port: 'COM3' })).toBe(true);
  });
});
