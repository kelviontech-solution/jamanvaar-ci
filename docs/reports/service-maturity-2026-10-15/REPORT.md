# Service maturity — 15 improvements

15 October 2026. Implementation and local acceptance are complete for the scope below. Changes remain in the working tree. Production has not been deployed and native installers have not been distributed.

## Where to find the features

Restaurant Admin → Operations contains Daily brief, Guided recovery, Payment exceptions, Recurring menus, Cashier & refills, Historical food costs and Restore configuration. Licensed Kiosk/QR operations entry points use the shared console, with backend product authorization. POS-specific configuration requires the POS management product.

Super Admin → Branches → branch → **Branch Licensing** controls branch allocations. Captain's table workspace exposes eligible thali refills. POS has **Quick service**, barcode/SKU entry, favorites and configured payment methods/quick amounts. Kiosk asks whether to resume a recovered cart or start fresh. Native update scheduling appears with an available update in the installed application.

## Acceptance by requirement

| # | Improvement | Implemented behavior and verification |
| --- | --- | --- |
| 1 | Guided recovery | Branch-scoped kitchen/device/payment problems, actionable steps, real device-sync commands and retry of original local failed print jobs. Browser verified a persisted REQUEST_SYNC command. Physical printing remains a device acceptance check. |
| 2 | Branch licensing | Effective/expiry dates, feature restrictions, device quotas, inherited restaurant grants, downgrade impact preview, acknowledgment, revisions and future-change cancellation. Cannot enable an unpurchased restaurant product. Backend tested cross-branch scope, quotas, stale writes, expiry and disabled features; Super Admin preview/save tested in browser. |
| 3 | Payment exceptions | Pending attempts, confirmed-but-undelivered payments, refund issues, duplicate warnings and inconsistent ledgers. Assignments have a responsible person, note and optimistic version. Retry provider status or original kitchen delivery without another collection. Tested assignment, branch denial, duplicate recovery and history navigation. |
| 4 | Recurring menus | Branch-timezone daily/weekly windows, holiday exceptions, reviewed checksum, overlap prevention, branch price/availability overrides and prior-value restoration. Publication drift stops for review. Tested activation, restoration, holidays, conflicts and browser create/cancel. |
| 5 | Cashier speed | Branch favorites, repeat-last-order into an empty cart, barcode/SKU aliases, quick cash amounts and enabled tenders. Modifier dishes retain customization. Guest splits also exclude disabled methods. Browser verified barcode entry, enabled-only checkout and draft recovery. |
| 6 | Shared wait | QR, Kiosk, Captain, pickup display and owner brief use one backend estimate from backlog/history, falling back to configured preparation time. Stale client estimates are labeled. Tests cover sparse history, filtering and backlog. |
| 7 | Allergens | Restaurant-entered menu declarations, customer customization and published QR snapshots; canonical lines preserve declarations and guest instructions for kitchen routing. Tested that unpublished changes cannot replace published QR declarations. |
| 8 | Historical food cost | Server-frozen ingredient costs, units and names; recorded waste/spoilage valuation; before-tax sales, discounts, refunds and missing-cost reporting. Values survive resync and supplier price changes. Browser verified named ingredient/unit reporting. Estimated food margin is distinguished from business profit. |
| 9 | Thali refills | Branch policy identifies meal, included dishes and portion limit. Signed Captain requests append station-routed zero-price lines to the original order. Extras follow normal charged ordering. Concurrent retries produce one refill and preserve the bill. Physical Captain-to-KDS acceptance remains separate. |
| 10 | Reviewed rollback | Preview saved menu/appearance versions, select fields, review affected scope and acknowledge before restoring. Reject stale previews. Historical orders/credentials remain intact. Tested menu price restore, QR text restore, authorization, audit and browser preview. |
| 11 | Owner mobile brief | Rolling 24-hour confirmed collections/refunds, outstanding bills, cases, complaints, shortages and kitchen wait. Bill/case/complaint actions open the selected record. Desktop and 390px phone layouts tested. |
| 12 | Controlled updates | Schedule optional installed-app updates. Installation waits for operational guards, persistence health, active orders, pending sync and active printing. Existing signature verification remains. Failure stops automatic retries; installed version is checked after restart. Native lifecycle tests pass; signed hardware upgrades remain required. |
| 13 | Preserve work | POS recovery retained; Captain table drafts remain restaurant/branch scoped; QR retains its scoped cart; Kiosk offers Resume/Start fresh for short-lived session carts. Browser verified POS/Kiosk refresh recovery. Regression verifies stale Captain memory cannot write into a new branch. |
| 14 | Plain statuses | Separate local-save, waiting-to-sync, cloud-save and kitchen-received messages. Local Captain/POS saves no longer promise kitchen delivery. |
| 15 | Exact task navigation | Cases, unpaid bills and complaints retain selected references across operations tasks. Reopening the current task refreshes its focused record. Missing canonical orders still show original checkout/payment history. Tested with a real pending payment. |

## Verification

All tests use the isolated local QA database. External gateway requests/mail/transports are blocked or captured. No real charge, refund or customer message was sent.

| Check | Result | Evidence |
| --- | --- | --- |
| Full root regression | **2,192 passed**, 311 files | `evidence/verification-root.json` |
| Focused backend | **58 passed**, 4 files | `evidence/verification-backend.json` |
| Existing QR/auth/order API regression | **125 passed**, 6 files | `evidence/verification-regression.json` |
| TypeScript | Seven web applications passed | `evidence/verification-types.json` |
| Admin/Super Admin browser | **12/12 passed** | `evidence/browser-results.json` |
| POS/Kiosk browser | **4/4 passed** | `evidence/terminal-browser-results.json` |
| API and seven web builds | **Passed**; Vite reports existing large-chunk warnings | `evidence/verification-builds.json` |

These separate runs have overlapping coverage; do not sum them as unique scenarios. Browser layout checks cover new operations pages at desktop and 390px widths, not every screen/device. Screenshots are in `evidence/`; retained `failure-*` screenshots document earlier iterations, superseded by final result JSON.

Verification also fixed inactive QR branches returning the wrong error status; a Captain subscriber bypassing draft branch scoping; inconsistent ledgers crashing the inbox; confirmed refunds contributing to false duplicate warnings; silent Kiosk cart carry-over; missing accessible labels; and oversized checkboxes. Receipt test expectations were updated for the existing order-reference delivery contract.

## Deploy and accept on devices

1. Back up production through the existing deployment process.
2. Apply Prisma migrations `20261015120000_branch_product_licenses` and `20261015130000_inventory_cost_snapshot`, in order. The QA runner applies SQL only to its isolated database and does not mark production migration history.
3. Generate Prisma Client, build/deploy the API and affected web applications. Enable jobs for the recurring scheduler. Existing advisory locks serialize publications across workers.
4. Build native releases with the existing signed pipeline, preserving package identifiers, signing identities and updater keys. Web builds do not produce verified APK/EXE installers.
5. Upgrade an existing retained-data installation outside service. Verify installed version, SQLite records, sync and print queues after restart. Android requires the operating-system installer confirmation.
6. Verify real UPI success/cancel/retry/webhook delay/refund through the approved acceptance procedure. Confirm one payment and one original kitchen order. Verify physical printing and Captain refill arrival on actual KDS devices.

## Practical limits

- Branch allocations narrow purchased restaurant products. They do not create a separate branch billing SKU or grant unpaid products. Disconnected clients receive changed server restrictions on reconnection; existing cached offline entitlement rules remain.
- Waits are approximate: recent preparation percentile plus a conservative three-ticket concurrency assumption. They are not station-specific machine learning or a promised service time.
- Costs freeze when the server first observes a line. A late offline upload cannot reconstruct unknown supplier prices at sale time. Missing old recipes/costs remain incomplete. Labour, overhead and unrecorded waste are excluded.
- Cost reports cover 90 days and at most 5,000 orders/waste records; exception queries cap attempts/orders at 1,000 each. Limit indicators identify bounded reports.
- Recurring windows end on the same local day; overnight service needs two windows. Conflicting manual edits stop automatic restoration for review. The form schedules one dish per window; the endpoint supports multiple reviewed changes.
- Appearance history begins with subsequent saved changes. Shared Kiosk rollback preserves per-terminal overrides.
- Included refills require an existing canonical dine-in order and online signed Captain access. Offline refill delivery is not silently claimed.
- Recovery never invents a missing kiosk sale. Reconnect/sync the original kiosk. A malformed or missing QR draft requires review. Unverified payments cannot be marked paid through recovery.
- Scheduled updates need the app running and the same release available. Busy devices wait up to two hours, then require rescheduling. Mandatory updates cannot be postponed. Android installer confirmation remains necessary.

## Reproduce

With the existing isolated QA environment and browser servers running:

```powershell
node docs/reports/service-maturity-2026-10-15/verify.cjs backend
node docs/reports/service-maturity-2026-10-15/verify.cjs regression
node docs/reports/service-maturity-2026-10-15/verify.cjs root
node docs/reports/service-maturity-2026-10-15/verify.cjs types
node docs/reports/service-maturity-2026-10-15/verify-builds.cjs
node docs/reports/service-maturity-2026-10-15/browser.cjs
node docs/reports/service-maturity-2026-10-15/browser-terminals.cjs
```

Private fixture credentials remain in the ignored `.jamanvaar` directory.
