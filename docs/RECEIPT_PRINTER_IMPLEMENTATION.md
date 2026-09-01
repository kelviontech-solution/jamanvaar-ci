# JAMANVAAR KIOSK — BUILT-IN RECEIPT PRINTER
## Automatic Installation, Discovery, ESC/POS Generation & Transactional Spooler

**Product**: JAMANVAAR Standalone Dealer Edition V1  
**Architecture Layer**: Hardware Abstraction Layer (HAL) & Kiosk Print Spooler  
**Date**: August 25, 2026  
**Status**: 100% Production Ready & Hardened  

---

## 1. System Flow & Architectural Principles

```
INSTALL JAMANVAAR KIOSK EXE
        ↓
PRINTER AUTO-DISCOVERY ON STARTUP
        ↓
PRINTER AUTOMATICALLY CONFIGURED (80mm/58mm Direct Thermal)
        ↓
CUSTOMER PLACES ORDER (Touch Kiosk)
        ↓
PAYMENT SUCCESSFUL
        ↓
ORDER CONFIRMED & LOCALIZED IN SQLITE
        ↓
TRANSACTIONAL PRINT JOB QUEUED (Idempotency Key & Duplicate Protected)
        ↓
RECEIPT AUTOMATICALLY PRINTED (Direct ESC/POS / Windows Spooler)
        ↓
CUSTOMER RECEIVES PRINTED SLIP & TOKEN
        ↓
KDS / POS CONTINUE PROCESSING IN REAL-TIME
```

### Golden Rule: Printing Never Controls Payment / Order Success
- **Payment $\rightarrow$ Order Confirmation $\rightarrow$ Database Storage $\rightarrow$ Print Dispatch**.
- If the thermal printer is temporarily offline or out of paper, the order **REMAINS 100% SUCCESSFUL**.
- Customer is displayed: *"Order confirmed. Your receipt is available digitally."*
- Print job remains securely in `db.printJobs` with status `RETRYING` or `PENDING` for auto-recovery when the printer reconnects.

---

## 2. Printer Discovery & Auto-Configuration Engine

### Supported Interfaces
- **USB Direct Line Thermal** (USB001 / Virtual USB Port)
- **Serial RS-232 / COM Port**
- **Network / LAN Thermal Kiosk Printer**
- **Windows OEM Driver Spooler**
- **Virtual / Native HAL Emulator**

### Auto-Configuration Priority (Zero Customer Configuration)
1. **Saved Hardware Configuration**: Automatically restores previously persisted printer selection from SQLite database.
2. **Kiosk Dedicated Built-in Printer**: Automatically targets built-in thermal units (`prn-kiosk-01`, `JAMANVAAR Built-in Thermal 80mm`).
3. **First Available Thermal Line Printer**: Matches ESC/POS compatible drivers with 80mm or 58mm profiles.
4. **Windows Default Printer**: Safe fallback to OS default printer.

> **Zero Customer Interaction Guarantee**: The customer never sees "Select Printer", "Choose Printer", printer driver dialogs, or Windows print preview windows.

---

## 3. Dedicated Thermal Receipt Formatting & ESC/POS Generation

### Layout Dimension Rules
| Feature | 80mm Thermal Standard (48 Columns) | 58mm Compact POS (32 Columns) |
|---|---|---|
| **Width** | 48 Characters | 32 Characters |
| **Branding** | Centered `JAMANVAAR` Logo Wordmark | Centered Compact Header |
| **Token Number** | Large Bold Centered `TOKEN #108` | Bold Centered `TOKEN #108` |
| **Columns** | `ITEM (26ch) QTY (4ch) RATE (7ch) AMT (8ch)` | `ITEM (16ch) QTY (3ch) AMT (10ch)` |
| **Word Wrapping** | Wraps dish names cleanly at 25 characters | Wraps dish names at 15 characters |
| **Taxes & Totals** | Itemized Subtotal, CGST 2.5%, SGST 2.5%, Round-Off | Itemized Subtotal, Taxes, Total |
| **Auto-Cutter** | `GS V 66 0` (0x1D, 0x56, 0x42, 0x00) | Supported on models with cutter |

### ESC/POS Command Protocol
```text
[ESC @]       Initialize Printer (0x1B, 0x40)
[ESC a 1]     Center Alignment
[ESC E 1]     Bold On
[GS ! 17]     Double Width & Double Height (Token Display)
[ESC E 0]     Bold Off
[ESC a 0]     Left Alignment
[GS V 66 0]   Full Paper Cut (0x1D, 0x56, 0x42, 0x00)
```

---

## 4. Transactional Print Queue & Crash Recovery

### Print Job State Machine
```
[PENDING] ────► [PRINTING] ────► [PRINTED] (Success)
                     │
                     ▼ (Device Offline / Paper Out)
               [RETRYING] (Max 3 attempts)
                     │
                     ▼ (Max attempts exceeded)
                [FAILED] (Awaiting Admin manual retry)
```

### Duplicate Print Protection
- Every print job is bound to `orderId`, `orderNumber`, and `receiptId`.
- Auto-print checks `status === 'PRINTED'` before queueing; will never accidentally print duplicate receipts on application restart.
- Explicit Admin reprints are tagged with `isReprint: true` and logged with the username in the audit trail.

### Crash Recovery
- If the application or Windows shuts down mid-order, `PrinterService.resumeCrashRecovery()` scans SQLite on startup, re-queues all unprinted jobs, and finishes physical dispatch automatically.

---

## 5. Admin Hardware & Spooler Controls

Located in **Admin POS $\rightarrow$ Settings $\rightarrow$ Hardware / Receipt & E-Bill**:
- **Hardware Profile**: Displays connected printer name, interface port, model, paper size, and real-time status (`READY` / `OFFLINE` / `PAPER_OUT`).
- **Live Switcher**: Select between built-in 80mm and compact 58mm models.
- **[TEST PRINT]**: Dispatches formatted test receipt slip without generating fake orders.
- **[REFRESH PRINTERS]**: Auto-rediscovers USB and Serial connections.
- **Transactional Spooler Table**: Live log of all print jobs with order numbers, timestamps, retry counts, and **[REPRINT]** button.

---

## 6. Verification & Test Results

```text
✓ tests/modifiers.test.ts (3 tests)
✓ tests/voice.test.ts (4 tests)
✓ tests/coupons.test.ts (3 tests)
✓ tests/recommendations.test.ts (2 tests)
✓ tests/ebill.test.ts (4 tests)
✓ tests/reports.test.ts (2 tests)
✓ tests/printer_queue.test.ts (6 tests)
✓ tests/lifecycle.test.ts (2 tests)
✓ tests/pricing.test.ts (4 tests)
✓ tests/sync_online_offline.test.ts (2 tests)
✓ tests/chatbots.test.ts (5 tests)

Test Files  11 passed (11)
     Tests  37 passed (37) - 100% Success
```
