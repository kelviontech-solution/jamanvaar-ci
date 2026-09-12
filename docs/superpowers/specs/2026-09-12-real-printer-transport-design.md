# Real Network Printer Transport — Design

**Status:** Approved
**Phase:** Phase 4, sub-project C-2 (of: refunds ✅, payments visibility ✅, real e-bill delivery ✅, real printer transport, POS live payment-status check ✅)

## Problem

Both `packages/api/src/printer.ts` (`PrinterService`, used by kiosk-user and kiosk-admin) and `apps/restaurant-system/pos/src/services/printerService.ts` (`PosPrinterService`) generate correct ESC/POS bytecode (`generateEscPosBytecode`) but never actually send it anywhere. `PrinterService.processQueue()` unconditionally marks every job `PRINTED` with a comment admitting it's a simulation (`printer.ts:400`); `PrintQueueRepository.addJob` (shared, `packages/database/src/repositories.ts:2136`) marks POS jobs `SUCCESS` at creation time, even more bluntly. No Tauri/Rust code anywhere talks to a real USB, serial, network, or Windows-driver printer.

## Non-goals

- USB, Serial, and Windows-driver (spooler RAW mode) transport — each needs either vendor-specific Rust crates or OS-specific driver bindings, and can't be verified without real hardware attached to this machine. Only `NETWORK_LAN` (raw TCP to port 9100, the standard raw-print port most networked ESC/POS printers support) is built now — confirmed by the user as the interface to target first.
- Restructuring `PrintQueueRepository.addJob` itself. It's called from 10 files, most unrelated to customer-facing receipts/KOTs (shift reports, EOD Z-reports, PDF export). Real dispatch is added only at the two call sites that matter — `PosPrinterService.printOrderReceipt`/`printKOT` — leaving every other caller (and its existing tests) untouched.
- USB/Serial/Windows-driver/Virtual-Emulator printers keep today's exact simulated-success behavior. Only `NETWORK_LAN` printers get a real dispatch attempt.
- Running inside anything other than the compiled Tauri desktop app (a plain browser preview, Storybook, the Vitest test suite) also keeps the simulated path — there is no IPC bridge to call in those contexts, and this is detected at runtime rather than assumed.

## Architecture

**Runtime detection.** `packages/api`'s `PrinterService` and POS's `PosPrinterService` each gain:

```typescript
private static isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
```

This is not a test-only shim — it is the correct real-world check: `packages/api` is shared TypeScript that could run inside a browser preview or the current Vitest suite (which already seeds a real `NETWORK_LAN` fixture printer, `prn-kitchen-01` at `192.168.1.150:9100`, used for kitchen KOT routing — confirmed by reading `packages/database/src/db.ts:831-844`). Gating on this gives correct behavior everywhere: real dispatch only happens inside the actual compiled desktop app, never in a test runner or browser tab that has no IPC bridge to a physical printer.

**Byte generation, factored out for reuse.** `PrinterService.generateEscPosBytecode` currently builds text via `generateReceiptText` then wraps it in ESC/POS init+cut bytes inline. This wrap step is extracted into a small reusable helper so the print-queue's real-dispatch path can wrap a job's *already-formatted* text (receipt or KOT — both are plain strings by the time they reach the queue) without needing to regenerate it from an `Order`:

```typescript
private static wrapEscPos(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text + '\n\n\n');
  const initCmd = new Uint8Array([0x1b, 0x40]); // ESC @ (Initialize)
  const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]); // GS V 66 0 (Cut paper)
  const fullPayload = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
  fullPayload.set(initCmd, 0);
  fullPayload.set(textBytes, initCmd.length);
  fullPayload.set(cutCmd, initCmd.length + textBytes.length);
  return fullPayload;
}

public static generateEscPosBytecode(order: Order, paperSize: ReceiptPaperSize = '80mm'): Uint8Array {
  const text = this.generateReceiptText(order, undefined, paperSize);
  return this.wrapEscPos(text);
}
```

`generateEscPosBytecode`'s public output is unchanged (same bytes, same signature) — this is a behavior-preserving extraction, not a rewrite.

**Real dispatch helper**, added to both `PrinterService` and `PosPrinterService` (duplicated, not shared — these are two independent classes in two independent packages with no existing shared base, matching this codebase's established pattern of per-app printer services):

```typescript
private static async dispatchToNetworkPrinter(printer: PrinterDevice, text: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = Array.from(this.wrapEscPos(text));
  await invoke('send_escpos_bytes', { ip: printer.ipAddress, port: Number(printer.port) || 9100, bytes });
}
```

The dynamic `import('@tauri-apps/api/core')` (rather than a static top-level import) means the module is only touched when actually dispatching to a network printer — it's already a real, hoisted workspace dependency (confirmed present in every consuming app's `package.json` and hoisted to the repo's root `node_modules`), so this resolves safely at both build and test time; it simply isn't *called* unless `isTauriRuntime()` already gated the branch.

`PosPrinterService` has no existing `generateEscPosBytecode`/wrap step to extract from (confirmed by the Phase 4c-1 audit — POS never generated real ESC/POS bytes at all) — it gains its own `wrapEscPos` and `dispatchToNetworkPrinter` as new private static methods, identical in body to `PrinterService`'s.

**New Tauri command**, identical across all three apps that dispatch real prints (kiosk-user, kiosk-admin, POS — POS-Admin never triggers a real print, confirmed by the Phase 4c-1 e-bill audit finding no print/e-bill call sites there), added to each app's `src-tauri/src/main.rs` using the exact same plain-`std::net` style every existing command in these files already uses (no new Cargo dependency):

```rust
#[tauri::command]
fn send_escpos_bytes(ip: String, port: u16, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:{}", ip, port);
    let socket_addr = addr.parse().map_err(|e| format!("Invalid printer address {}: {}", addr, e))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("Could not connect to printer at {}: {}", addr, e))?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    stream.write_all(&bytes).map_err(|e| format!("Failed to send data to printer: {}", e))?;
    Ok(())
}
```

Registered in each file's existing `.invoke_handler(tauri::generate_handler![...])` list, alongside whatever commands that app already has.

**Wiring into `PrinterService.processQueue()`** (kiosk-user/kiosk-admin's shared queue, `packages/api/src/printer.ts`): the existing try block's `// Simulate physical ESC/POS byte transmission...` comment and unconditional `job.status = 'PRINTED'` becomes conditional:

```typescript
if (printer.interfaceType === 'NETWORK_LAN' && printer.ipAddress && this.isTauriRuntime()) {
  await this.dispatchToNetworkPrinter(printer, job.formattedText || '');
}
job.status = 'PRINTED';
```

If `dispatchToNetworkPrinter` throws (real connection refused/timeout), it propagates into the same `catch` block `processQueue` already has — the existing retry/FAILED state machine (`job.attempts < job.maxAttempts` → `RETRYING`, else `FAILED`) now runs on a real error instead of never firing. Every other interface type, and every non-Tauri runtime, falls straight through to the unchanged simulated `PRINTED` line.

**Wiring into `PosPrinterService`** (POS's separate queue, `apps/restaurant-system/pos/src/services/printerService.ts`): `printOrderReceipt`, `printKOT`, `reprintReceipt`, and `printTestSlip` become `async`. Each still calls `PrintQueueRepository.addJob(...)` exactly as today (that shared repository method is untouched, per the Non-goals above — it keeps marking the job `SUCCESS` synchronously at creation), then attempts real dispatch and *corrects* the job to `FAILED` if that real attempt fails:

```typescript
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
      const failed = PrintQueueRepository.updateJobStatus(job.id, 'FAILED', err?.message || 'Printer communication failed');
      return failed || job;
    }
  }

  return job;
}
```

The same shape applies to `printKOT` (using `kot.station`'s resolved printer + `payload` from `generateKOTText`) and `printTestSlip` (using the diagnostic `rawPayload`). `reprintReceipt` reuses `printOrderReceipt`'s exact new body (it already duplicates most of it today) plus its own audit-log call, unchanged.

Every existing call site of these four methods (`apps/restaurant-system/pos/src/store/posStore.ts` ×4, `PosBillsView.tsx`, `PosPrintQueueModal.tsx`, `PosSettingsView.tsx`) calls them fire-and-forget today, not reading a return value — making the methods `async` and leaving those seven call sites un-awaited is behavior-preserving (a floating Promise is legal JS/TS; nothing there depended on synchronous completion). The one call site that *does* read the return value synchronously, `PosThermalReceiptModal.tsx`'s `handlePrint`, is updated to `await` it (see below) — this is also a real improvement: today, `handlePrint` reads `job.status` immediately after the synchronous call and can never see a real failure; after this change it awaits the real attempt first, so a genuine network failure now reaches the UI's existing `FAILED` banner instead of always reporting success.

## Data flow

1. A receipt or KOT print job is triggered (auto on payment confirmation, or a manual "Print Receipt"/reprint/test-slip button).
2. The relevant service resolves which physical printer this job targets (`getPrinterForRole`/`getPrinterForStation`, unchanged) and generates the plain-text payload (unchanged).
3. If that printer's `interfaceType` is `NETWORK_LAN`, it has a real `ipAddress`, and the app is actually running inside a compiled Tauri build: the formatted text is wrapped into ESC/POS bytes and sent via `invoke('send_escpos_bytes', ...)` to a real Rust `TcpStream` connection to `ipAddress:port`.
4. The Rust command blocks (with a 5-second connect timeout and a 5-second write timeout) until the bytes are written or an error occurs, then returns `Ok(())` or `Err(message)` back across the IPC boundary.
5. On success, the job is marked `PRINTED`/left as the optimistic `SUCCESS` (kiosk/POS respectively — matching each side's existing terminal-status vocabulary, unchanged by this design). On failure, kiosk's existing retry state machine runs; POS's job is corrected to `FAILED` with the real error message.
6. Every other printer interface type, and any non-Tauri runtime, is unaffected — same simulated-success behavior as today.

## Error handling

- Printer already marked `OFFLINE`/`ERROR` in local state: rejected before any network attempt, exactly as today (`printer.ts`'s existing pre-check; POS has no equivalent pre-check today and this design doesn't add one — out of scope, since Non-goals excludes restructuring beyond the two touched methods' own real-dispatch step).
- TCP connect refused/timeout, or write timeout: surfaces as a real Rust `Err(String)`, which `invoke()` rejects as a JS error, caught by the calling TypeScript and turned into the existing `FAILED`/`RETRYING` job states with that real message — never a silent success.
- Any other interface type, or a non-Tauri runtime: no change from current behavior — the printer is presumed to have printed, matching the honest limitation that no real transport exists yet for USB/Serial/Windows-driver.
- Invalid `ipAddress`/`port` (empty string, non-numeric port): the Rust command's own `addr.parse()` fails first, returned as `Err("Invalid printer address ...")` — same error path as a real connection failure, no separate validation needed on the TypeScript side.

## Testing

- `packages/api` unit tests (new, added to the existing printer test coverage — `tests/pos_touch_and_printer_system.test.ts` or a new `tests/printer_network_transport.test.ts`, whichever the plan's file-structure step decides):
  - Outside a Tauri runtime (no `window.__TAURI_INTERNALS__`, i.e. the Vitest environment as it already runs today): dispatching a job to the existing `NETWORK_LAN` fixture printer (`prn-kitchen-01`) still resolves `PRINTED`/`SUCCESS` exactly as before — confirms this change doesn't alter any existing test's outcome.
  - With `window.__TAURI_INTERNALS__` stubbed present and `@tauri-apps/api/core`'s `invoke` mocked to resolve: dispatching to a `NETWORK_LAN` printer calls `invoke('send_escpos_bytes', { ip, port, bytes })` with the printer's real `ipAddress`/`port` and a byte array whose first two bytes are `0x1b, 0x40` (ESC @) and last four are `0x1d, 0x56, 0x42, 0x00` (GS V 66 0).
  - With the mocked `invoke` rejecting: the job ends up `FAILED` (POS) or enters the retry path (kiosk), with the rejection's message attached — not a silent `PRINTED`/`SUCCESS`.
- No test can open a real TCP socket to a physical printer in this environment — the Rust command itself is verified only by `cargo build`/`cargo check` succeeding (confirms it compiles against each app's existing Tauri v2 dependencies with no new crate needed) and by manual review against the exact `TcpStream`/`UdpSocket` patterns already proven working elsewhere in these same three `main.rs` files. This is explicitly flagged to the user as unverified against real hardware, consistent with why this sub-project was scoped to `NETWORK_LAN` only in the first place.
