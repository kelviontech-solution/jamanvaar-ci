import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db, PrintQueueRepository } from '@jamanvaar/database';
import { PrinterService } from '../packages/api/src/printer';

/**
 * BUG-024: a print job used to be created as SUCCESS/PRINTED before any hardware was ever
 * contacted, and every interface type except NETWORK_LAN-inside-Tauri "simulated success" —
 * so a restaurant with a USB or Windows-driver printer (the common case) was told every
 * receipt printed when nothing was ever sent anywhere. A job is PRINTED only when a real
 * transport actually confirms; everything else fails with a real reason.
 */
describe('PrinterService — real NETWORK_LAN dispatch', () => {
  beforeEach(() => {
    db.printJobs = [];
  });

  afterEach(() => {
    vi.doUnmock('@tauri-apps/api/core');
    delete (globalThis as any).window?.__TAURI_INTERNALS__;
  });

  it('a newly queued job starts PENDING, not already SUCCESS/PRINTED', () => {
    const printer = db.configuredPrinters.find((p) => p.interfaceType === 'NETWORK_LAN')!;
    const job = PrintQueueRepository.addJob({ type: 'KOT_TICKET', printerId: printer.id, printerName: printer.name, rawPayload: 'X' });
    expect(job.status).toBe('PENDING');
    expect(job.completedAt).toBeUndefined();
  });

  it('outside a Tauri runtime, a NETWORK_LAN job fails honestly instead of claiming PRINTED', async () => {
    const printer = db.configuredPrinters.find((p) => p.interfaceType === 'NETWORK_LAN' && p.status === 'READY');
    expect(printer).toBeDefined();

    const job = PrintQueueRepository.addJob({
      type: 'KOT_TICKET',
      printerId: printer!.id,
      printerName: printer!.name,
      rawPayload: 'TEST KOT TEXT'
    });
    db.printJobs[0] = { ...job, status: 'PENDING', attempts: 0, maxAttempts: 1, formattedText: 'TEST KOT TEXT' };

    const result = await PrinterService.processQueue();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(db.printJobs[0].status).toBe('FAILED');
    expect(db.printJobs[0].lastError).toMatch(/desktop app/i);
  });

  it.each(['USB', 'SERIAL', 'WINDOWS_DRIVER'] as const)(
    'a %s printer in a browser tab fails with a clear reason (it needs the desktop app) instead of a false success',
    async (interfaceType) => {
      const printer = db.configuredPrinters.find((p) => p.interfaceType === interfaceType && p.status === 'READY');
      expect(printer, `no seeded ${interfaceType} printer to test against`).toBeDefined();

      const job = PrintQueueRepository.addJob({ type: 'KOT_TICKET', printerId: printer!.id, printerName: printer!.name, rawPayload: 'X' });
      db.printJobs[0] = { ...job, status: 'PENDING', attempts: 0, maxAttempts: 1, formattedText: 'X' };

      await PrinterService.processQueue();
      expect(db.printJobs[0].status).toBe('FAILED');
      expect(db.printJobs[0].lastError).toMatch(/desktop app/i);
    }
  );

  it('the VIRTUAL_EMULATOR type is an explicit dev-only simulator and may still succeed', async () => {
    const printer = PrintQueueRepository ? db.configuredPrinters[0] : null; // keep import used
    const virtualPrinter = {
      ...db.configuredPrinters[0],
      id: 'prn-virtual-test',
      interfaceType: 'VIRTUAL_EMULATOR' as const,
      status: 'READY' as const
    };
    db.configuredPrinters.push(virtualPrinter);

    const job = PrintQueueRepository.addJob({ type: 'KOT_TICKET', printerId: virtualPrinter.id, printerName: virtualPrinter.name, rawPayload: 'X' });
    db.printJobs[0] = { ...job, status: 'PENDING', attempts: 0, maxAttempts: 1, formattedText: 'X' };

    await PrinterService.processQueue();
    expect(db.printJobs[0].status).toBe('PRINTED');
    expect(printer).toBeTruthy();
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
