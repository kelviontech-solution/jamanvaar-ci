# Operations expansion — delivery and verification

Implemented locally on 15 October 2026. The 20 requested tools connect to the existing order engine, payment ledger, menu publication, licensing and branch authorization. This is a source/acceptance report, not a production deployment certificate.

## Where to find the tools

- Restaurant Admin: **Operations → Operations hub**, `/restaurant-admin/operations`.
- Kiosk Admin: **Operations → Operations hub**, `/kiosk-admin/operations`.
- Standalone QR Admin: **Operations Hub** in its sidebar; select the working branch.
- Managers work in their assigned branch. Shared menu publication and scheduling explicitly say **restaurant-wide** and require an owner.
- POS: **Payment → Apply Discount → manager authorization → Request approval from manager device**. Online refunds use the same authorization dialog with a payment-specific scope.
- **Display** controls are available in Admin, POS, Captain, KDS and customer Kiosk. Full training extends existing staff-practice panels.

## Feature delivery

| Feature | Implemented behavior | Verification |
| --- | --- | --- |
| Opening/closing checklists | Separate daily confirmations, notes, actor/time, menu version and operational snapshot; concurrent-edit protection. | API validation/conflicts; browser save/reload for both phases. |
| Branch service control | Shared QR/Kiosk pause, guest message, weekly local-time hours, preparation estimate and kitchen capacity. Server enforces new-order admission. | Policy tests, kiosk rejection/existing-order progression, browser persistence. |
| Menu change review | Dish/price/photo/availability/branch/category/modifier/tax/override differences and affected branches. Publish requires the reviewed checksum. | Exact differences, stale checksum and browser publication. |
| Scheduled menu changes | One-time future price/availability changes, preview, cancellation, atomic publication, applied/failed status and audit. Later independent edits stop publication. | Due worker, replay, changed draft and stale preview; browser schedule/cancel. |
| Dish profitability | Current price, recipe ingredient cost, estimated food margin, units and approximate discounted sales allocation. Missing costs remain unknown. | Calculation tests, API report and browser display. |
| Preparation planning | Historical daily demand, history/buffer controls and branch-local peak hours suggest portions. | Calculation tests and browser report. |
| Branch comparison/copy | Owner reviews differences and selects supported service fields. Source/destination versions are rechecked transactionally. | API permissions/versions; browser copy preserving temporary pause. |
| Accessible display | Standard, larger text/touch targets and stronger contrast; saved per app/device. | Five app builds/type checks; browser persistence and small-screen checks. |
| Support diagnostics | Whitelisted app versions, connection health, pending sync counts and local admin print status counts. No contacts, PINs, credentials, raw logs or receipt content. | API redaction and browser download inspection. |
| Channel acceptance | Licensed POS/Captain/Kiosk/QR channels; separate counter/online records. Requires paid/completed orders and distinct kitchen/receipt/online-return confirmations. | Invented evidence rejection, cash/online separation, QR-only licensing; browser persistence. |
| Pickup display | Expiring/revocable private TV link. Canonical token states: Preparing, Ready, Collected; no guest identity or bill details. | Redaction/rotation tests; browser Ready → Served → Collected. |
| Search by task | Operations search and owner-console task search open service controls, menu review, handovers and manager approvals. | Browser search/navigation. |
| Pinned shortcuts | Persist per user/branch and remain subject to current role/license task filtering. | Browser pin/reload. |
| Contextual help | Scope, consequences, prerequisites and examples beside operational controls. | Browser expansion/content check. |
| Full training sandbox | In-memory modifiers/quantity/discount → kitchen → ready → served → failed payment/retry → training receipt. | Browser walkthrough confirms production order count stays unchanged. |
| Unified history | Branch order/reference/token lookup, recorded progress, collections, attempts, refunds and linked audits. Future device progress history is server-owned. | API branch isolation; browser POS timeline. |
| Complaint follow-up | Assigned owner/manager, optional branch order, due/overdue state, required resolution and retained history. | Scope/resolution tests; browser create/resolve. |
| Remote approvals | Signed staff request, authorized branch decision, expiring single claim bound to terminal/staff/action. Refund proof binds exact payment, amount and retry key. | Denial/replay/scope tests; actual POS dialog → owner decision → applied discount. |
| Guided transfers | Pending-work review, staff reassignment and quota-checked replacement. Old device stays active until redemption. Old-branch staff cache receives a redacted removal; stale writers cannot move staff back. | Transfer/session/redaction tests, local-cache regression, browser staff move. |
| Rush-hour view | Canonical backlog, ready food, tables/source, unpaid collections and device attention. Refreshes preserve unfinished forms. | Real branch records and desktop/phone browser checks. |

## Verification evidence

- **59 new operations checks pass**: 28 API/integration tests and 31 policy/calculation tests. [Backend result](evidence/verification-backend.json).
- **302 existing backend regression tests pass** across 20 suites covering QR payment/status, tenant/session isolation, menu, plans, sync and dashboards.
- **2,179 shared/root tests passed**. After the final staff-cache change, the affected staff/session/navigation suites were rerun: **34 passed**, including the added removal regression. These runs overlap; do not add their totals.
- **21/21 operations browser scenarios pass**, including desktop and 390px phone checks. [Browser results](evidence/browser-results.json).
- POS remote approval passed separately through the actual discount dialog. [POS result](evidence/pos-approval.json).
- **25/25 cross-app browser scenarios pass** across POS, Captain, KDS and Kiosk. [Cross-app results](evidence/cross-app-browser-final.json).
- API builds. Admin, POS, Kiosk, Captain and KDS frontend builds and TypeScript checks pass. [Types](evidence/verification-types.json), [builds](evidence/verification-builds.json). Existing Vite bundle-size/dynamic-import warnings remain.
- Browser fixtures use real local HTTP authentication, authorization and PostgreSQL records in an isolated test database. External delivery/payment networks are blocked. Fixture restaurants are archived or removed by runners; referenced plan rows can remain in the isolated database.

## Defects corrected during acceptance

JSONB key ordering caused false menu differences. Several select labels had ambiguous accessible names. Context polling could remount unfinished forms. Browser assertions sometimes read the server before a save completed. Mobile task navigation used too much vertical space; it now has a compact selector. Staff transfers initially retained the old branch's PIN cache; redacted removal and stale-writer protection now close that gap. Scheduling/admission use consistent entity-before-admission locking.

## Boundaries and release notes

- Checklist and acceptance confirmations are staff attestations; they do not automatically count cash or prove physical printer/payment-app acceptance.
- Schedules are one-time activations, not recurring calendar rules. The running API worker checks every 30 seconds and processes overdue pending changes after restart.
- Branch copying supports service settings only; credentials, payment connections, devices, staff and identity are not cloned.
- Food margin uses current recipe costs and approximate discounted order values. It is not historical accounting profit or refund reconciliation. Preparation suggestions need staff judgment.
- Rush view shows up to 200 oldest open/unpaid orders; pickup shows up to 100 recent orders; planning analyzes up to 50,000 orders. Rush/planning limits are identified in the UI.
- Only stored history is shown. Missing older events are not invented. Receipt/provider acceptance still needs real services/hardware.
- Service controls govern QR/Kiosk admission and preserve existing ticket progress. Ordinary offline POS billing remains available. Disconnected kiosks learn new cloud policies on reconnection.
- Staff transfers revoke old-branch server authorization and remove cached sign-in records on sync. Disconnected terminals must reconnect to receive the change.
- Licenses remain restaurant-wide; branch settings are not branch-specific commercial entitlements.
- No production deployment, GitHub push, native APK/EXE installation, real customer charge, physical printing or real email/WhatsApp delivery was performed for this request.

## Source map and reproduction

- `cloud/api/src/modules/operations/`: controller/module, branch policy, versioned records, scheduler, workflow authorization, analytics and tests.
- Existing order-sync, payments and QR public services: shared admission and recorded progress.
- Existing activation service: authenticated owner replacement flow and cross-branch pending-work checks at redemption.
- Entity sync and shared staff repository: transfer receipt, redacted removal, stale-writer protection and cache removal.
- `apps/restaurant-system/pos-admin/src/components/operations/`: UI, typed client, responsive styles and pickup display; admin/QR routes, sidebar and global search connect it.
- POS manager dialog and shared staff-session helper: remote decision claim and scoped refund proof.
- Shared display preferences, full training sandbox, practice panel and app entry points.
- Kiosk `branchService.ts`: pre-checks before customer checkout/counter confirmation.

Run `node docs/reports/operations-expansion-2026-10-15/verify.cjs backend`, `types`, `builds` or `root`. Browser runners require the existing isolated API/static QA servers and private local test state. Never point fixture runners at production.
