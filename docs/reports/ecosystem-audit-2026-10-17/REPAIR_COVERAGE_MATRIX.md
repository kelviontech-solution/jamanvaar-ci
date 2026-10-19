# Repair coverage: both audits

Latest shared admission repair: [Entity-sync persistence](ENTITY_SYNC_2026-10-19.md). Catalog/customer/inventory cursors now wait for their data, and pending financial recovery defers admission. This does not close full conflict/recovery/legacy acceptance.

Latest W03 continuation: [Manager-reviewed POS interrupted-operation recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md). Exact-command resumption works after refresh, with explicit bill/cart review and no automatic payment/print/drawer repeat. Other app recovery interfaces and installed acceptance remain open.

Further W03/W04 update: [Inbound sync persistence](INBOUND_SYNC_2026-10-19.md). Failed page preparation rolls back, cursor advancement waits for persistence, and queued/quarantined edits resist legacy future-clock overwrites. Generic replay recovery and concurrent admission remain open.

Latest source/verification update: [19 October cancellation and recorded balances](CANCELLATION_BALANCES_2026-10-19.md). POS running-dish removal now awaits SQLite, preserves cancelled history and is browser-checked; local activity/receipt/settlement balances share one calculation. Remaining caller/recovery/installed gates still keep EC-01 and W03 open.

Date: 17 October 2026. See the [detailed master plan](REPAIR_MASTER_PLAN.md). This is a planned coverage register, not a new defect verification run.

Implementation continuation: [18 October changes and verification](IMPLEMENTATION_2026-10-18.md). The original rows below preserve audit coverage; current repair status and acceptance limits are recorded in that continuation and its verification JSON.

Latest: [18 October reassessment](REASSESSMENT_2026-10-18.md) and [channel durability continuation](CHANNEL_DURABILITY_2026-10-18.md), following the [POS checkout/protected recovery stage](FINANCIAL_CHECKOUT_2026-10-18.md). Kiosk draft/quote/admission, POS/Captain kitchen submission, Captain cancellation and POS return callbacks now use the awaited boundary in the documented scope. **EC-01 remains open** for other financial callers, legacy storage policy, guided recovery and installed acceptance. Historical progress entries below must be read with this newer status.

EC findings were inspected at the newer ecosystem baseline. Earlier F findings may overlap those findings or already have source fixes. The rows below preserve that distinction: **41 finding IDs do not imply 41 independent, currently open defects**.

Follow-up: [Admin returns and POS online reconciliation](ADMIN_RETURN_RECONCILIATION_2026-10-18.md) removes additional callers from the preceding gap register. Its new full/focused/browser/build results are recorded independently; ten work packages remain unfinished.

No application repair or fresh browser/native/provider acceptance was performed while writing this plan. For every row, add the current reproduction, repair commit, regression and acceptance evidence before marking VERIFIED.

## Ecosystem findings

| ID | Baseline issue/risk | Work package | Required closure evidence |
| --- | --- | --- | --- |
| EC-01 | Local financial success before durable write | W03 | Kill/restart and storage-failure acceptance: order, effects and outbox recover atomically |
| EC-02 | Material payload changes share sync identity | W04 | Same-time modifier/split changes survive; one mutation replay applies once |
| EC-03 | Captain quick-add skips choices/minimum | W02 | Every add/repeat/edit route validates; valid Captain KOT appears correctly in POS/KDS |
| EC-04 | Future client clock silently dominates edits | W04 | Server revisions and explicit conflict outcomes under future/past/concurrent edits |
| EC-05 | Recreated QR order loses source/identity/dates | W07 | Empty-target restore retains guest tracking, source, timestamps, branch and receipt references |
| EC-06 | Operational snapshot omits financial/stock recovery set | W07, W06 | Explicit scope, protected live history and full isolated ledger/stock/loyalty recovery drill |
| EC-07 | Partial refund becomes zero sales/open bill | W06 | Independent sale/return/collection/outstanding fixture reconciles across reports/exports |
| EC-08 | Database-day grouping differs from business day | W06 | Timezone/cutoff and later-day refund cases produce agreed daily totals |
| EC-09 | Printer configuration manufactures READY | W08 | No status promotion without real evidence; physical failure and recovery acceptance |
| EC-10 | Device activation mistaken for connectivity | W08 | Fresh/stale/never-seen/revoked devices classified consistently across dashboards |
| EC-11 | Root/API all-project type gates fail | W01 | Exact declared commands pass without weakening meaningful test compilation |
| EC-12 | Stale source assertions/return contracts hide signal | W01 | Caller review and behaviour tests retain business/privacy assertions |
| EC-13 | Undefined fixture ID can broaden cleanup | W01 | Setup failure cannot delete another run's records; owned isolated DB cleanup |
| EC-14 | Tenant locks/pools need measured limits | W11 | Profiled realistic load, fairness, bounded waiting/recovery and documented supported envelope |
| EC-15 | Missing/invalid encryption configuration can downgrade backups | W07 | Explicit required policy rejects unsafe configuration; encrypted restore/key recovery passes |
| EC-16 | Health/telemetry incomplete; constant Core RUNNING | W08, W11 | Actual readiness plus injected incident detection, exact-task recovery and alert clearance |

## Earlier ordering-flow findings

“Revalidate existing work” means source changes were observed or documented after the earlier audit; it does not declare the repair accepted. Several current edits remain uncommitted.

| ID | Earlier issue | Current planning treatment | Work package / closure check |
| --- | --- | --- | --- |
| F01 | Required options bypassed in POS/Kiosk quick-add | Revalidate existing POS/Kiosk fixes; Captain independently remains EC-03 | W02: all add surfaces plus server guard |
| F02 | POS/Kiosk minimum/maximum not enforced | Revalidate existing channel fixes | W02: add, increment, merge, edit, offline and submission |
| F03 | Repeated QR additions exceed maximum | Revalidate newer QR merge validation | W02: two additions cannot create an invalid line |
| F04 | Recall discards active cart | Current POS work changes cart-switch contract; review all callers | W01/W09: hold/preserve/discard choice and return to displaced cart |
| F05 | Recovery draft disagrees with recalled active cart | Revalidate current persistence and switch changes | W03/W09: reload restores visible active order and retained displaced draft |
| F06 | Order chef notes missing from draft | Source now includes note persistence; verify full journey | W09: type/save/reload/hold/recall/reconnect preserves instructions |
| F07 | Chef-note editor retains previous guest text | Revalidate editor lifecycle | W09: new guest clean; original order retains its own notes |
| F08 | Settlement shortcut replaces active cart | Structured guard result exists in current work; tests/callers need review | W01/W09: live-order, bill-request and table shortcuts preserve unfinished work |
| F09 | QR back-to-cart loses checkout fields | QR checkout draft implementation now exists; verify privacy and navigation | W09: name/contact/note survive review and expire/reset appropriately |
| F10 | MENU_CHANGED reload loses checkout input | Revalidate current refresh implementation | W05/W09: changed-line review retains input and requires valid quote |
| F11 | Failed quote leaves “Checking” with no retry | Revalidate current error/retry UI | W09: definite error, safe retry/reconnect and no stale charge |
| F12 | New-tab order recovery lacks original proof | Current QR app/API edits exist; security acceptance required | W09/W10: legitimate scoped recovery works, guessed public ID still denied |
| F13 | Cancelled zero-balance order asks for payment | Revalidate combined payment/fulfillment status copy | W05: cancellation, paid/refunded and balance rules drive actions |
| F14 | Recommendations ignore dietary filters | Revalidate all recommendation/reorder surfaces | W02/W09: active declared restrictions apply consistently |
| F15 | Same-device generated OTP treated as verification | Newer flow restricts unconfigured verification; verify all entry paths | W09/W10: no verified account authority without real proof |
| F16 | Kiosk points treated as rupees instead of configured reward | Shared loyalty corrections exist; full lifecycle acceptance outstanding | W06: configured reward valuation, opt-in, earn/refund/replay ledger |
| F17 | Online quote removes chosen benefits late | Revalidate newer pricing/confirmation work | W05/W06: explicit revised total before payment; no unsupported reward debit |
| F18 | All online errors become unavailable/no safe retry | Revalidate newer error classification | W05: distinguish network/config/provider/unknown; retain attempt reference |
| F19 | Coupon/instruction fields lack touch keyboard | Newer keyboard work exists; inspect every guest field | W09: keyboard-only touchscreen task completion, focus and visible input |
| F20 | Partial tender invents disabled secondary method | Revalidate enabled-method allocation fixes | W05: cash-only/UPI-only/mixed configurations and amount shortcuts |
| F21 | Print receipt marked SENT before completion | Revalidate queue/history changes; hardware remains separate | W08: queued/dispatched/confirmed or completion-unconfirmed states |
| F22 | POS UUID mapped to Self-Order Kiosk on receipt | Source label fix documented at newer baseline; retain regression | W08: correct source/friendly terminal on online/offline/restore/reprint |
| F23 | Six-second receipt close interrupts work | Revalidate timer/interaction changes | W09: reading/focus/reprint pauses; last-receipt recovery |
| F24 | QR service-help disappears on options error | Revalidate error/retry/fallback | W09: distinguish disabled vs temporary failure without losing help |
| F25 | Failed UPI status check permits manual settlement | Revalidate fail-closed/reconciliation path; no duplicate charge demonstrated | W05: unknown → retry/reconcile, late success and controlled counter fallback |

## Additional acceptance scope from the reports

These are usability recommendations or verification gaps, not newly reproduced defects.

| Area | Work package | Acceptance |
| --- | --- | --- |
| Small-screen POS payment layout | W09 | Primary confirmation and total/remaining/change visible and usable at 1366×768 |
| Duplicate reward offers | W06/W09 | One consistent selected reward and balance in cart/checkout |
| UUID/double-table labels | W08/W09 | Friendly normalized device/table names across UI and receipts |
| Offline/save/sync/kitchen status | W03/W08/W09 | Distinct truthful states with exact recovery action |
| Kiosk staff diagnostics on customer screen | W08/W09 | Customer token/help prominent; privileged repair tools staff-gated |
| Irrelevant language/type/setup steps | W09 | Plan/config-aware shorter journey with accessible alternatives |
| Optional restaurant page/table context/localization | W09 | Direct menu and retained branch/table context; configured language across shell |
| Missing-photo presentation | W09 | Intentional compact fallback; separately diagnose actual asset/network failures |
| Receipt delivery and next-guest privacy | W09 | Sending/sent/failed feedback, no premature reset or retained guest details |
| Multi-device table ownership/amendments | W04/W05 | Concurrent edits explicit; KOT deltas and extra charge/refund reconcile |
| Onboarding and support | W08/W09/W10 | Purchased/enabled/configured/ready distinct; exact-task actions and sanitized reference |
| Dead-code/large-component maintenance | W01/W12 | Prove unused paths before deletion; small refactors retain behaviour and supported entries |
| Production capacity/full authenticated UI/native/provider acceptance | W10/W11/W12 | Publish actual evidence and blockers; never infer acceptance from a successful bundle |

## Implementation progress

Baseline at start of this batch: HEAD `ccf17d93` (unchanged — nothing committed), 8 files already modified
from earlier sessions preserved untouched. Root `tsc -b`: 8 errors. `cloud/api` test typecheck: 10 errors.
`cloud/api` build typecheck: clean. Root vitest: 2241 passed, 8 failed (7 files). `cloud/api` vitest: baseline
not yet re-run at the time these fixes were made (see below).

```text
ID: EC-11
Status: VERIFIED
Source commit and working-tree identity: uncommitted, on top of ccf17d93
Current reproduction and expected behaviour: `npm run typecheck` (root) and `npm run typecheck --workspace=@jamanvaar/cloud-api`
  both failed before this batch, exactly as DEFECTS.md describes (incomplete Order cast, mock callback
  typing, 6 unresolved tooling/qa `/src/...` imports; 10 unknown-value errors in operations-expansion/
  service-maturity e2e specs).
Changed files and repair commit: tsconfig.json (exclude tooling/qa/** — these two files are Vite-root
  `/src/...` browser-injection probes, never Node-resolvable, same treatment as the existing cloud/**
  and docs/** exclusions); tests/audit_receipt_and_csv_regressions.test.tsx (intentional minimal Order
  fixture cast via `unknown`, matching TS's own suggested idiom); tests/super_admin_workflow.test.tsx
  (gave the hoisted `can` mock the real AuthContext signature instead of an inferred zero-arg one);
  cloud/api/test/operations-expansion.e2e.spec.ts and service-maturity.e2e.spec.ts (helper `body` params
  typed to match supertest's own accepted type instead of `unknown`; `app.get(...)` results cast to the
  real service type so `prisma.runAsTenant<T>` can infer T instead of defaulting to `unknown`).
Regression test and result: `npm run typecheck` (root) — 0 errors. `npm run typecheck --workspace=@jamanvaar/cloud-api`
  — 0 errors. `node node_modules/typescript/bin/tsc --noEmit --incremental false -p cloud/api/tsconfig.build.json`
  — 0 errors (unchanged from baseline). All three re-run directly, not inferred from a passing bundle.
Browser/native/provider/hardware evidence: not applicable (type gate only).
Compatibility/migration/rollback note: no runtime behavior changed; tooling/qa exclusion only affects what
  this one tsc project checks, not what Vite serves at runtime for those probe pages.
Remaining risk and closure review: none known for the exact declared commands. A future QA fixture added
  under tooling/qa/ with real Node-resolvable imports (not `/src/...`) would also be silently excluded —
  acceptable since that directory's whole purpose is Vite-root-relative browser probes.
```

```text
ID: EC-12
Status: FIXED IN SOURCE (root suite) / partially VERIFIED
Current reproduction and expected behaviour: root vitest had 8 failing tests across 7 files: a stale
  brand-asset file-path assertion (logos are now embedded PNG data URLs), a settlement test asserting
  `toBe(true)` against the new structured CartSwitchResult (`{ok:true}`/`{ok:false,reason}`) introduced by
  this session's simultaneous-edit/cart-switch-protection work, the same pattern in a hold/recall test,
  two source-text regexes keyed to renamed UI copy ("Generate key" -> "Create pairing code", "Applications
  tab" -> "Products & access", "isn't enabled" -> "is unavailable"), a station-performance report test
  asserting a fabricated zero-count row for a station name that was never seeded, and a Kiosk Terminals
  empty-state test checking stale App.tsx text for a feature since replaced by a materially better
  in-context "request a key" flow (KioskSetupPanel.tsx, with real duplicate-request tracking).
Changed files and repair commit: tests/jamanvaar_startup_experience.test.ts, tests/usability_financial_integrity.test.ts,
  tests/pos_cashier_ux_overhaul.test.ts, tests/super_admin_qr_activation_key_label.test.ts,
  tests/pos_admin_report_data_engine.test.ts, tests/restaurant_admin_kiosk_terminals_cta.test.ts (rewritten
  against the current KioskSetupPanel.tsx implementation, not App.tsx), apps/restaurant-system/pos-admin/
  src/navSections.ts (one genuine fix, not a test-only change: 'KIOSK_WELCOME' was defined and reachable
  via settings search but had no sidebar entry in either POS_ADMIN or KIOSK_ADMIN's KIOSK MANAGEMENT group
  — the test correctly caught a real navigation gap and was left asserting the original requirement).
Regression test and result: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot --no-cache`
  (root) — 321 files passed, 2252 tests passed, 0 failed (re-run directly after each fix and once more at
  the end of the batch).
Browser/native/provider/hardware evidence: not applicable (unit/source-text test level).
Compatibility/migration/rollback note: navSections.ts change is additive (one more reachable nav item);
  no removal of any existing item or behavior.
Remaining risk and closure review: the cloud/api vitest suite (20 baseline failures, EC-12's other
  examples) was not yet triaged in this batch — see EC-13 below for what was run against it. Status here
  covers the root suite only; cloud/api failures remain OPEN pending classification.
```

```text
ID: EC-13
Status: VERIFIED
Current reproduction and expected behaviour: ~112 cloud/api e2e spec files call `tx.<model>.deleteMany({
  where: { id: someId } })` in afterAll, where someId is a `let` assigned only partway through beforeAll.
  Prisma's documented behavior treats an explicitly-undefined where-field as "no filter on that field" —
  if beforeAll throws first (the exact "setup failed" case this must survive), the same cleanup can
  silently become an unbounded deleteMany across the shared test database instead of a no-op.
Changed files and repair commit: cloud/api/src/prisma/prisma.service.ts (installTestCleanupGuard, called
  from onModuleInit — a $use middleware, active ONLY when the connected database's name contains "test"
  (the same signal test/setup.ts already requires before any suite may run at all), that throws before
  any deleteMany/delete whose where clause has an id-shaped key — `/^id$|Id$/` — explicitly set to
  undefined. Centralized here rather than hand-patching ~112 files individually, which would only protect
  whichever files happened to get touched and not any future one); cloud/api/test/prisma-cleanup-guard.e2e.spec.ts
  (new: proves the guard actually throws against the real connected test database for both deleteMany and
  delete, that it still allows a normal fully-specified deleteMany matching zero rows, and that it does not
  false-positive on an unrelated optional non-id field that happens to be undefined).
Regression test and result: prisma-cleanup-guard.e2e.spec.ts — 4/4 passed against the real connected
  jamanvaar_test database (`npx vitest run`, full suite). Confirmed the guard does not reject any of the
  other 1,551 passing cloud/api tests' legitimate cleanup calls across 171 files — no false positive.
Browser/native/provider/hardware evidence: not applicable.
Compatibility/migration/rollback note: guard is inert against any non-test database by construction (checks
  the connected DB name, not an env flag that could be left on by accident); removing it is a one-method
  revert with no data/schema impact. The other ~111 files with the same pattern are not individually
  patched — this entry intentionally does not claim they are "fixed in source" one by one; the shared
  guard is the actual closure mechanism for all of them at once, including ones not enumerated here.
Remaining risk and closure review: none known. A future test writing a genuinely-intentional `where: {
  someId: undefined }` filter (not an owning identity, just named with an Id suffix) would need to restate
  it without the literal `undefined` — an acceptable, narrow constraint given what it prevents.
```

```text
ID: EC-03
Status: FIXED IN SOURCE, regression test not yet added
Current reproduction and expected behaviour: Captain's quick-add button (CaptainTableWorkspaceModal.tsx)
  called addItemToCart(item, [], '', 'COURSE_1', 1) unconditionally — a dish with a required modifier
  group or a configured minimum quantity above one entered the cart with zero choices and quantity one,
  reaching the kitchen incomplete. Two further bypasses existed: CaptainModifierModal's own quantity
  stepper had no min/max bound (started at 1, incremented without limit), and ThaliRefills.tsx's
  "chargeable extra" dropdown added directly with no choice/quantity check at all.
Changed files and repair commit: apps/restaurant-system/captain/src/components/tables/
  CaptainTableWorkspaceModal.tsx (quick-add now calls dishNeedsChoiceBeforeAdd/resolveModifierGroups,
  the same shared contract POS/Kiosk/QR already use, and opens Customize instead of adding bare when a
  choice is needed); CaptainModifierModal.tsx (quantity initializes to the dish's minQuantity, +/- bounded
  to [min,max] with disabled affordances); captainStore.ts (addItemToCart/updateCartQuantity clamp to
  clampItemQuantity, matching posStore's own defense-in-depth); ThaliRefills.tsx (blocks the chargeable-
  extra path with an explanatory message when the chosen dish needs a choice, directing staff to the main
  menu's Customize option instead, since this dropdown has no customization sheet of its own).
Regression test and result: apps/restaurant-system/captain type-checks clean (tsc --noEmit). No automated
  regression test added yet for this batch — EC-03's own acceptance calls for "Captain → KOT → POS with
  identical fixtures to POS/Kiosk/QR," which needs an e2e harness exercising Captain's actual store this
  session did not have time to build; flagging explicitly rather than claiming coverage that doesn't exist.
Browser/native/provider/hardware evidence: not applicable (not yet run).
Compatibility/migration/rollback note: no schema/protocol change; purely client-side validation routing,
  same pattern already shipped for POS/Kiosk/QR in an earlier session batch.
Remaining risk and closure review: add the cross-channel fixture test EC-03's acceptance calls for before
  marking VERIFIED. repeatPreviousOrder (replaying a past COMPLETED order's own already-validated items)
  was deliberately left as-is — it reuses historical, previously-valid selections, matching posStore's own
  repeatOrder precedent from the earlier F-series work.
```

```text
ID: EC-07
Status: REPRODUCED (root cause confirmed in source), NOT fixed this batch
Current reproduction and expected behaviour: ReportsService.getRestaurantSales's `isSale` predicate requires
  paymentStatus = 'SUCCESS' exactly; a PARTIALLY_REFUNDED order (collected then partially returned) is
  excluded from sales entirely and double-counted as `open` (its `paymentStatus IS DISTINCT FROM 'SUCCESS'`
  predicate does not exclude REFUNDED-family statuses), matching DEFECTS.md's ₹0-sales/open-bill example
  exactly.
Why not fixed this batch: a real OrderPaymentEntry ledger and paymentBalance()/reconcileOrderPayments()
  already exist (cloud/api/src/modules/payments/order-payment-ledger.ts) with the right collected/refunded/
  net/outstanding semantics — but reconcileOrderPayments is only invoked from the gateway-confirmation path
  (syncConfirmedPaymentLedger), not from the generic device order-sync push a plain offline POS cash refund
  would take. Correctly fixing the report without under- or double-counting a cash-handled refund that
  never created an OrderPaymentEntry row requires tracing every order-sync write path that can set
  paymentStatus to a refund-family value and confirming what it does (or doesn't) write to meta — work the
  master plan itself sequences as W06, explicitly dependent on W03–W05's data contracts, which this batch
  did not reach. A fix attempted without that tracing risks trading one financial-reporting bug for another.
Changed files and repair commit: none yet.
Regression test and result: none yet.
Remaining risk and closure review: still OPEN. Do not treat this investigation as a fix — the report's
  behavior is unchanged from the audit baseline.
```

## Update template

For each row during implementation:

```text
ID:
Status: OPEN / REPRODUCED / FIXED IN SOURCE / VERIFIED / BLOCKED / NOT REPRODUCED ON CURRENT VERSION
Source commit and working-tree identity:
Current reproduction and expected behaviour:
Changed files and repair commit:
Regression test and result:
Browser/native/provider/hardware evidence, where required:
Compatibility/migration/rollback note:
Remaining risk and closure review:
```
