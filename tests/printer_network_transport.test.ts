import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db, PrintQueueRepository } from '@jamanvaar/database';
import { PrinterService } from '../packages/api/src/printer';

describe('PrinterService — real NETWORK_LAN dispatch', () => {
  beforeEach(() => {
    db.printJobs = [];
  });

  afterEach(() => {
    vi.doUnmock('@tauri-apps/api/core');
    // @ts-expect-error test-only cleanup of a property this suite adds
    delete (globalThis as any).window?.__TAURI_INTERNALS__;
  });

  it('outside a Tauri runtime, a NETWORK_LAN job still resolves PRINTED exactly as before', async () => {
    const printer = db.configuredPrinters.find((p) => p.interfaceType === 'NETWORK_LAN' && p.status === 'READY');
    expect(printer).toBeDefined();

    const job = PrintQueueRepository.addJob({
      type: 'KOT_TICKET',
      printerId: printer!.id,
      printerName: printer!.name,
      rawPayload: 'TEST KOT TEXT'
    });
    db.printJobs[0] = { ...job, status: 'PENDING', formattedText: 'TEST KOT TEXT' };

    const result = await PrinterService.processQueue();
    expect(result.processed).toBe(1);
    expect(db.printJobs[0].status).toBe('PRINTED');
  });

  it('inside a Tauri runtime, dispatches real bytes via invoke("send_escpos_bytes", ...) for a NETWORK_LAN printer', async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.__TAURI_INTERNALS__ = {};

    const printer = db.configuredPrinters.find((p) => p.interfaceType === 'NETWORK_LAN' && p.status === 'READY')!;
    const job = PrintQueueRepository.addJob({
      type: 'KOT_TICKET',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload: 'TEST KOT TEXT'
    });
    db.printJobs[0] = { ...job, status: 'PENDING', formattedText: 'TEST KOT TEXT' };

    await PrinterService.processQueue();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [command, args] = invokeMock.mock.calls[0];
    expect(command).toBe('send_escpos_bytes');
    expect(args.ip).toBe(printer.ipAddress);
    expect(args.port).toBe(Number(printer.port));
    expect(args.bytes[0]).toBe(0x1b);
    expect(args.bytes[1]).toBe(0x40);
    expect(args.bytes.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(db.printJobs[0].status).toBe('PRINTED');
  });

  it('inside a Tauri runtime, a rejected invoke() marks the job FAILED with the real error', async () => {
    const invokeMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.__TAURI_INTERNALS__ = {};

    const printer = db.configuredPrinters.find((p) => p.interfaceType === 'NETWORK_LAN' && p.status === 'READY')!;
    const job = PrintQueueRepository.addJob({
      type: 'KOT_TICKET',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload: 'TEST KOT TEXT'
    });
    db.printJobs[0] = { ...job, status: 'PENDING', attempts: 0, maxAttempts: 1, formattedText: 'TEST KOT TEXT' };

    await PrinterService.processQueue();

    expect(db.printJobs[0].status).toBe('FAILED');
    expect(db.printJobs[0].lastError).toContain('ECONNREFUSED');
  });
});
