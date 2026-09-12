# Real Network Printer Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated "always PRINTED/SUCCESS" print-queue dispatch with a real raw-TCP ESC/POS send (port 9100) for `NETWORK_LAN` printers, wired through a new Tauri command shared by kiosk-user, kiosk-admin, and POS.

**Architecture:** Both `PrinterService` (kiosk, `packages/api`) and `PosPrinterService` (POS) gain an `isTauriRuntime()` check and a `dispatchToNetworkPrinter()` helper that calls a new `send_escpos_bytes` Tauri command via `invoke()`. Only `NETWORK_LAN` printers, and only inside an actual compiled Tauri app, take the real path — everything else keeps today's exact simulated behavior.

**Tech Stack:** TypeScript (packages/api, POS), Rust + `std::net::TcpStream` (Tauri v2 commands, no new crate), Vitest with a mocked `@tauri-apps/api/core`.

**Spec:** `docs/superpowers/specs/2026-09-12-real-printer-transport-design.md`

## Global Constraints

- Only `NETWORK_LAN` gets real dispatch. USB/SERIAL/WINDOWS_DRIVER/VIRTUAL_EMULATOR keep the exact current simulated-success behavior — no code path for them changes.
- Real dispatch only runs when `typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window` is true. Outside that (Vitest, a browser preview), the simulated path runs unchanged — this is what keeps every existing printer test passing unmodified except where a method's signature itself becomes `async` (see Tasks 2 and 4).
- `PrintQueueRepository.addJob` (`packages/database/src/repositories.ts:2136`) is never modified — it has 10 unrelated callers. Real dispatch is layered on top of its existing synchronous "mark SUCCESS at creation" behavior, only inside `PosPrinterService`'s own methods.
- No new Cargo dependency in any of the three `src-tauri` projects — `send_escpos_bytes` uses only `std::net::TcpStream`, matching every existing command in these files.
- POS-Admin's `src-tauri` is not touched — it never dispatches a real print (confirmed by the Phase 4c-1 audit).

---

### Task 1: kiosk's `PrinterService` — real network dispatch in `processQueue`

**Files:**
- Modify: `packages/api/src/printer.ts`
- Test: `tests/printer_network_transport.test.ts` (new)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `PrinterService.isTauriRuntime(): boolean`, `PrinterService.wrapEscPos(text: string): Uint8Array` (both `private static`, exercised only indirectly through `processQueue`/`generateEscPosBytecode` in tests — there is no public API change for this task's own consumers, but the byte-shape it produces is asserted directly). Task 3's Rust command name, `send_escpos_bytes`, is the exact string this task's `invoke()` call must use — Task 3 registers a command with that exact name.

- [ ] **Step 1: Write the failing tests**

Create `tests/printer_network_transport.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/printer_network_transport.test.ts`
Expected: the first test passes already (no code change needed for the simulated path — it's a baseline check); the second and third FAIL because `processQueue` never calls `invoke` at all yet.

- [ ] **Step 3: Add `isTauriRuntime`, extract `wrapEscPos`, add `dispatchToNetworkPrinter`**

In `packages/api/src/printer.ts`, replace the existing `generateEscPosBytecode` method (current lines 304-324):

```typescript
  /**
   * Generates binary ESC/POS command bytecode for physical thermal printers
   */
  public static generateEscPosBytecode(order: Order, paperSize: ReceiptPaperSize = '80mm'): Uint8Array {
    const text = this.generateReceiptText(order, undefined, paperSize);
    return this.wrapEscPos(text);
  }

  /**
   * Wraps already-formatted receipt/KOT text in real ESC/POS init + cut
   * command bytes. Factored out of generateEscPosBytecode so the print
   * queue's real network dispatch (see dispatchToNetworkPrinter) can wrap
   * a job's own formattedText directly, without regenerating it from an
   * Order the queue may not have (a KOT job never had one).
   */
  private static wrapEscPos(text: string): Uint8Array {
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
  private static async dispatchToNetworkPrinter(printer: PrinterDevice, text: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = Array.from(this.wrapEscPos(text));
    await invoke('send_escpos_bytes', { ip: printer.ipAddress, port: Number(printer.port) || 9100, bytes });
  }
```

- [ ] **Step 4: Wire the real dispatch into `processQueue`**

In the same file, `processQueue`'s try block currently reads (current lines 395-404):

```typescript
      try {
        if (printer.status === 'OFFLINE' || printer.status === 'ERROR') {
          throw new Error(`Thermal printer "${printer.name}" is currently offline or paper out`);
        }

        // Simulate physical ESC/POS byte transmission to Windows spooler / serial port
        job.status = 'PRINTED';
        job.printedAt = new Date().toISOString();
        printer.lastPrintAt = new Date().toISOString();
        processed++;
```

Replace with:

```typescript
      try {
        if (printer.status === 'OFFLINE' || printer.status === 'ERROR') {
          throw new Error(`Thermal printer "${printer.name}" is currently offline or paper out`);
        }

        if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
          await this.dispatchToNetworkPrinter(printer, job.formattedText || '');
        }
        // Every other interface type, and any non-Tauri runtime (Vitest,
        // a browser preview), has no real transport yet — simulated success.
        job.status = 'PRINTED';
        job.printedAt = new Date().toISOString();
        printer.lastPrintAt = new Date().toISOString();
        processed++;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/printer_network_transport.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full root test suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all suites — `generateEscPosBytecode`'s output is unchanged by the extraction, and no other test calls `processQueue` directly with a NETWORK_LAN printer outside a Tauri runtime in a way this changes).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/printer.ts tests/printer_network_transport.test.ts
git commit -m "feat(printer): dispatch real ESC/POS bytes to NETWORK_LAN printers via Tauri"
```

---

### Task 2: POS's `PosPrinterService` — real network dispatch + async signatures

**Files:**
- Modify: `apps/restaurant-system/pos/src/services/printerService.ts`
- Modify: `tests/pos_touch_and_printer_system.test.ts`

**Interfaces:**
- Consumes: the same `send_escpos_bytes` Tauri command name Task 1 used and Task 3 registers.
- Produces: `PosPrinterService.printOrderReceipt(order, paperSize?): Promise<PrintJob>`, `PosPrinterService.printKOT(kot): Promise<PrintJob>`, `PosPrinterService.reprintReceipt(order, reason?, username?): Promise<PrintJob>`, `PosPrinterService.printTestSlip(printerId, paperSize?): Promise<PrintJob>` — all four change from returning `PrintJob` to `Promise<PrintJob>`. Task 4's `PosThermalReceiptModal.tsx` call site must `await` `printOrderReceipt`.

- [ ] **Step 1: Update the three existing tests that call these methods synchronously**

In `tests/pos_touch_and_printer_system.test.ts`:

Change (current line 108):
```typescript
  it('5. should dispatch persistent print jobs on receipt printing and survive in queue', () => {
```
to:
```typescript
  it('5. should dispatch persistent print jobs on receipt printing and survive in queue', async () => {
```
and change (current line 137):
```typescript
    const job = PosPrinterService.printOrderReceipt(order, '80mm');
```
to:
```typescript
    const job = await PosPrinterService.printOrderReceipt(order, '80mm');
```

Change (current line 163):
```typescript
  it('7. should support manual reprint with audit logging and preserve original sale integrity', () => {
```
to:
```typescript
  it('7. should support manual reprint with audit logging and preserve original sale integrity', async () => {
```
and change (current line 193):
```typescript
    const reprintJob = PosPrinterService.reprintReceipt(order, 'Customer lost receipt', 'Cashier Om');
```
to:
```typescript
    const reprintJob = await PosPrinterService.reprintReceipt(order, 'Customer lost receipt', 'Cashier Om');
```

Change (current line 204):
```typescript
  it('8. should support diagnostic test slip printing to any configured printer', () => {
```
to:
```typescript
  it('8. should support diagnostic test slip printing to any configured printer', async () => {
```
and change (current line 205):
```typescript
    const testJob = PosPrinterService.printTestSlip('prn-tandoor-01', '80mm');
```
to:
```typescript
    const testJob = await PosPrinterService.printTestSlip('prn-tandoor-01', '80mm');
```

- [ ] **Step 2: Run the printer test file to verify it fails**

Run: `npx vitest run tests/pos_touch_and_printer_system.test.ts`
Expected: FAIL — tests 5, 7, 8 now `await` a value that (before Step 4 below) is still a plain `PrintJob`, not a `Promise`. Awaiting a non-Promise value is valid JS and resolves to that same value immediately, so this specific change alone does NOT fail — this step's real purpose is confirmed in Step 5 below instead, once the methods actually become async. Run this now anyway to capture the current baseline (all passing) before Task 2's real code change.

- [ ] **Step 3: Write the new failing test for real dispatch + failure correction**

Add to `tests/pos_touch_and_printer_system.test.ts` (in the same `describe` block, after test 8):

```typescript
  it('9. dispatches real ESC/POS bytes to a NETWORK_LAN kitchen printer inside a Tauri runtime, and corrects the job to FAILED on a real send failure', async () => {
    const invokeMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.__TAURI_INTERNALS__ = {};

    const kot: KOTRecord = {
      id: 'kot-net-1',
      kotNumber: 'KOT-901',
      orderId: 'ord-net-1',
      orderNumber: 'ORD-901',
      tokenNumber: '901',
      station: 'Main Kitchen',
      type: 'FIRST',
      orderType: 'DINE_IN',
      cashierName: 'Cashier Om',
      items: [],
      createdAt: new Date().toISOString(),
      printed: false,
      status: 'PENDING'
    };

    const job = await PosPrinterService.printKOT(kot);
    expect(job.status).toBe('FAILED');
    expect(job.errorMessage).toContain('ECONNREFUSED');

    vi.doUnmock('@tauri-apps/api/core');
    delete (globalThis as any).window.__TAURI_INTERNALS__;
  });
```

Add `vi` to the existing `import { describe, it, expect, beforeEach } from 'vitest';` line (becomes `import { describe, it, expect, beforeEach, vi } from 'vitest';`).

- [ ] **Step 4: Run the tests to verify the new test fails**

Run: `npx vitest run tests/pos_touch_and_printer_system.test.ts`
Expected: test 9 FAILS (`printKOT`'s current body never checks `isTauriRuntime`/dispatches anything real, so `job.status` is `'SUCCESS'`, not `'FAILED'`).

- [ ] **Step 5: Add `isTauriRuntime`/`wrapEscPos`/`dispatchToNetworkPrinter`, and make the four methods async**

In `apps/restaurant-system/pos/src/services/printerService.ts`, add these three new private static methods right after the existing `generateKOTText` method (current line 178, before `printOrderReceipt`):

```typescript
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
```

Replace `printOrderReceipt` (current lines 183-201):

```typescript
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
```

Replace `printKOT` (current lines 206-226):

```typescript
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
```

Replace `reprintReceipt` (current lines 231-258):

```typescript
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
```

Replace `printTestSlip` (current lines 263-294):

```typescript
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/pos_touch_and_printer_system.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Run the full root test suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all suites — the 7 other call sites of these four methods, in `posStore.ts`, `PosBillsView.tsx`, `PosPrintQueueModal.tsx`, and `PosSettingsView.tsx`, call them fire-and-forget without reading the return value; a floating Promise there is legal and behavior-preserving).

- [ ] **Step 8: Type-check POS**

Run: `cd apps/restaurant-system/pos && npx tsc --noEmit`
Expected: errors at `PosThermalReceiptModal.tsx`'s `handlePrint` (Task 4 fixes this) — confirm no *other* unexpected errors appear (the 7 fire-and-forget call sites should be silent, since ignoring a Promise's return value is not a type error).

- [ ] **Step 9: Commit**

```bash
git add apps/restaurant-system/pos/src/services/printerService.ts tests/pos_touch_and_printer_system.test.ts
git commit -m "feat(pos-printer): dispatch real ESC/POS bytes to NETWORK_LAN printers via Tauri"
```

---

### Task 3: Rust — `send_escpos_bytes` command in all three dispatching apps

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src-tauri/src/main.rs`
- Modify: `apps/kiosk-system/kiosk-admin/src-tauri/src/main.rs`
- Modify: `apps/restaurant-system/pos/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: nothing from earlier tasks (Rust is independent of the TypeScript changes; Tasks 1 and 2 call this command by name, which is why it must be spelled exactly `send_escpos_bytes` with parameters `ip: String, port: u16, bytes: Vec<u8>`).
- Produces: the Tauri command Tasks 1 and 2 already call.

- [ ] **Step 1: Add the command to kiosk-user's `main.rs`**

In `apps/kiosk-system/kiosk-user/src-tauri/src/main.rs`, add this function after the existing `get_machine_ip` function (before `fn main()`):

```rust
/// Tauri command: send raw ESC/POS bytes to a network thermal printer over
/// TCP (port 9100 is the standard raw-print port most networked ESC/POS
/// printers support).
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let socket_addr = addr
        .parse()
        .map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream
        .write_all(&bytes)
        .map_err(|e| format!("Failed to send data to printer: {}", e))?;
    Ok(())
}
```

Then update the `invoke_handler` call in `fn main()` (current lines 96-101):

```rust
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            discover_local_core,
            test_core_connection,
            get_machine_ip,
            send_escpos_bytes
        ])
```

- [ ] **Step 2: Add the identical command to kiosk-admin's `main.rs`**

`apps/kiosk-system/kiosk-admin/src-tauri/src/main.rs` currently has no commands at all:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kiosk Admin desktop application");
}
```

Replace its entire contents with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Tauri command: send raw ESC/POS bytes to a network thermal printer over
/// TCP (port 9100 is the standard raw-print port most networked ESC/POS
/// printers support).
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let socket_addr = addr
        .parse()
        .map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream
        .write_all(&bytes)
        .map_err(|e| format!("Failed to send data to printer: {}", e))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![send_escpos_bytes])
        .run(tauri::generate_context!())
        .expect("error while running JAMANVAAR Kiosk Admin desktop application");
}
```

- [ ] **Step 3: Add the identical command to POS's `main.rs`**

In `apps/restaurant-system/pos/src-tauri/src/main.rs`, add the same function after the existing `get_machine_ip` function (before `fn main()`):

```rust
/// Tauri command: send raw ESC/POS bytes to a network thermal printer over
/// TCP (port 9100 is the standard raw-print port most networked ESC/POS
/// printers support).
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let socket_addr = addr
        .parse()
        .map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream
        .write_all(&bytes)
        .map_err(|e| format!("Failed to send data to printer: {}", e))?;
    Ok(())
}
```

Then update the `invoke_handler` call in `fn main()` (current lines 65-70):

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_local_core_info,
            get_machine_ip,
            send_escpos_bytes
        ])
```

- [ ] **Step 4: Verify each project compiles**

Run: `cd apps/kiosk-system/kiosk-user/src-tauri && cargo check`
Run: `cd apps/kiosk-system/kiosk-admin/src-tauri && cargo check`
Run: `cd apps/restaurant-system/pos/src-tauri && cargo check`
Expected: each succeeds with no errors (no new crate is needed — `std::net`, `std::io::Write`, `std::time::Duration` are all standard library). This confirms the Rust compiles; it does not and cannot confirm real hardware behavior — no physical printer is available to test against in this environment.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src-tauri/src/main.rs apps/kiosk-system/kiosk-admin/src-tauri/src/main.rs apps/restaurant-system/pos/src-tauri/src/main.rs
git commit -m "feat(tauri): add send_escpos_bytes command for real network printer dispatch"
```

---

### Task 4: POS UI — await the real print result

**Files:**
- Modify: `apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx`

**Interfaces:**
- Consumes: `PosPrinterService.printOrderReceipt(order, paperSize?): Promise<PrintJob>` (Task 2's new signature).
- Produces: nothing new — this is a leaf call site.

- [ ] **Step 1: Make `handlePrint` async and await the call**

Current (lines 41-58):

```tsx
  const handlePrint = () => {
    try {
      const job = PosPrinterService.printOrderReceipt(order, paperWidth);
      setActiveJobId(job.id);

      // Check if printer is simulated as offline/warning
      if (job.status === 'FAILED') {
        setPrintStatus('FAILED');
        setErrorMessage(job.errorMessage || 'Hardware printer offline or paper out');
      } else {
        setPrintStatus('SUCCESS');
        setTimeout(() => setPrintStatus('IDLE'), 3000);
      }
    } catch (err: any) {
      setPrintStatus('FAILED');
      setErrorMessage(err?.message || 'Failed to dispatch ESC/POS command');
    }
  };
```

Replace with:

```tsx
  const handlePrint = async () => {
    try {
      const job = await PosPrinterService.printOrderReceipt(order, paperWidth);
      setActiveJobId(job.id);

      // Check if printer is simulated as offline/warning, or a real
      // NETWORK_LAN dispatch genuinely failed.
      if (job.status === 'FAILED') {
        setPrintStatus('FAILED');
        setErrorMessage(job.errorMessage || 'Hardware printer offline or paper out');
      } else {
        setPrintStatus('SUCCESS');
        setTimeout(() => setPrintStatus('IDLE'), 3000);
      }
    } catch (err: any) {
      setPrintStatus('FAILED');
      setErrorMessage(err?.message || 'Failed to dispatch ESC/POS command');
    }
  };
```

The only change: `const handlePrint = () => {` becomes `const handlePrint = async () => {`, and the `printOrderReceipt` call gains `await`. Its existing `onClick={handlePrint}` call site elsewhere in this file needs no change — an event handler returning a Promise instead of `void` is valid in React.

- [ ] **Step 2: Type-check and build**

Run: `cd apps/restaurant-system/pos && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/restaurant-system/pos && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Type-check kiosk-user and kiosk-admin**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit`
Expected: no errors in either — Task 1 didn't change any public method signature in `PrinterService` (only added new `private` methods and changed the *internal* implementation of `processQueue`, which was already `async` and returns the same shape), so no caller in either app needs updating.

- [ ] **Step 4: Commit**

```bash
git add apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx
git commit -m "fix(pos): await the real print result before reporting success"
```
