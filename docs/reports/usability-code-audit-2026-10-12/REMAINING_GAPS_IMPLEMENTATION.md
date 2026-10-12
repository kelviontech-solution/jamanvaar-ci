# Remaining financial gaps: fixes and further findings

The next implementation pass is documented in [FOUND_GAPS_IMPLEMENTATION.md](FOUND_GAPS_IMPLEMENTATION.md), including the R01–R06 results and remaining limits.

12 October 2026. Follow-up to [NEXT_GAPS_IMPLEMENTATION.md](NEXT_GAPS_IMPLEMENTATION.md). Baseline HEAD remains `8a6a402eb17409dc2e0c4737ae1204fa20d9df43`; existing working-tree changes are preserved. This is a local implementation and verification report, not production acceptance or a GitHub push.

## Changes applied

| Finding | Result | Limits |
|---|---|---|
| N01: status-only refund/void | Billing and the separate Order Details dialog now share commands. Local commands run transactionally, use the signed-in manager, dirty the canonical order for sync and retain stock/loyalty/audit effects. Voids reject paid/part-paid bills and cancel associated kitchen lines. Refunds validate actual amounts, require confirmation of money already returned, use the original collecting register and block rewriting a closed till. QR counter returns/actions use the existing authorized, versioned server endpoints; online returns use the existing payment ledger. Refund retry keys persist through lost responses/reloads, including the general online-payment dialog. | These actions **record money staff already returned**; they do not initiate a Razorpay transfer. First partial cash/manual-UPI returns are supported in Order Details. Further/mixed-tender returns need the payment ledger. A closed local till does not yet have a complete current-till return workflow. Offline actor identity comes from the cached session; server endpoints enforce their existing verified owner/manager proof. |
| N02: automatic counted closure | Date rollover leaves the previous day `CLOSING`, without fabricated counted cash, closure time or closing actor. Day History exposes pending reconciliation. Closing yesterday scopes shifts/KOTs to yesterday and preserves today's active day and register. LAN day-close notifications no longer close arbitrary open tills. A shift spanning multiple business dates must be counted independently. Both count and discrepancy reason are validated by the service. | The rollover hour is restaurant-wide and currently uses the existing Asia/Kolkata utilities. Changes to the hour do not migrate legacy untagged history. |
| N03: fabricated shift report | Shift statement and active shift view derive amounts from their own canonical bills. Reports include real order types, actual split lines, wallet, returns and cancellations, with paise precision. PDF distinguishes gross bill value from net collections and labels split amounts as already included in tenders. Mixed partial legacy refunds without a return tender stay unattributed. Detailed bills missing from old shifts are explicitly labelled; recorded totals are preserved. | This corrects shift reporting; other legacy report readers still need convergence on the same ledger definitions. Printer hardware was not tested. |
| N04: implicit zero till count | Close Till requires a deliberate count confirmation, finite nonnegative values, whole note counts and a discrepancy explanation. A cashier discrepancy uses the existing manager approval flow; the approving name is logged. Changing the balance/count resets confirmation. The handler rechecks the live register before closure; repeated close cannot rewrite a previous count. | Approval uses the existing local manager/PIN mechanism. Live native-device/server-attested acceptance remains separate. |

The owner can set **Business date rollover** in Restaurant Admin → Settings → Report branding & legal profile. Midnight is supported. The server validates an integer hour from 0–23 and requires an active owner session bound to the administrator device; a customer terminal or branch manager cannot change the restaurant profile. Terminals receive it through their existing profile refresh. The cutoff is committed locally only after the server acknowledges it.

## Additional bugs fixed during verification

- Legacy overnight shift orders were excluded solely because the calendar day differed from shift opening. They now use the register and actual time window.
- Cash paid-in/paid-out movements were omitted from day reconciliation. Register movements now participate in the expected balance.
- Refunds could adjust whichever register happened to be open. They now update the original collecting register; partial cash returns retain the unreturned collection.
- Day-close LAN notifications closed today's registers while yesterday was being reconciled. Closure notifications now leave independent register counts to shift-record synchronization.
- The second refund form treated `0` as “refund everything,” used a separate cloud/local path and could imply a return without confirmation. It now shares validated commands.
- A partial local return could mark the whole order refunded and make remaining kitchen tickets appear served. It now preserves operational status; financial readers use the recorded return amount. Daily refund rows use the actual amount and recorded actor/reason instead of a fictional Manager.
- General online refund requests generated a fresh key on every retry. Default attempts now survive a lost response; a confirmed successful response ends that attempt.
- Billing details labelled pending/refunded payments “FULLY SETTLED.” They now display the actual payment status.
- The This Month filter in Day History had no implementation. It now filters business dates; Today/Yesterday use the canonical restaurant date.
- Billing day groups, order-day navigation and EOD report selection passed an independent fixed 06:00 cutoff. Their default now follows the configured canonical restaurant cutoff and timezone; tagged historical day records retain their recorded date. The legacy explicit-hour API remains for compatible callers/tests.
- Demo owner/manager names were populated in branding settings. Blank names stay blank. Save feedback now identifies which fields the cloud profile acknowledged.
- A navigation test imported the entire admin app to check a pure tab validator. The real tab definitions/validator now live in `navigation/adminTabs.ts`, re-exported by the app, reducing test loading without changing routing.

## Verification

Evidence and scope are indexed in [REMAINING_GAPS_VERIFICATION.json](evidence/REMAINING_GAPS_VERIFICATION.json).

- [Full root suite](evidence/REMAINING_GAPS_FULL_TESTS.json): **1,898 tests passed**. This ran before the final partial-return/daily-date refinements.
- [Final focused matrix](evidence/REMAINING_GAPS_TESTS.json): **147 tests across 14 files passed**, including those final refinements. Counts overlap the full run and must not be added together.
- [API unit checks](evidence/REMAINING_GAPS_API_TESTS.json): **4 tests passed**.
- [Seven frontend builds](evidence/remaining-gap-builds/RESULTS.json) passed; the changed POS/Admin applications were rebuilt in [final financial builds](evidence/financial-final-builds/RESULTS.json).
- API `nest build`, API typecheck, final root `tsc --noEmit` and `git diff --check` pass.
- [19 broad browser fixtures](evidence/remaining-gap-components/RESULTS.json) and [8 focused final browser fixtures](evidence/financial-final-components/RESULTS.json) passed their assertions with no horizontal overflow or runtime exceptions. The focused set also includes the separate Order Details refund form.

The financial regression matrix exercises full/partial returns, paid/part-paid void refusal, missing actor/confirmation, transactional rollback after loyalty failure, lost-response retry keys, QR cash endpoint/version, separate registers, overnight rollover, yesterday/today isolation, explicit empty-till confirmation, repeated closure and mixed wallet/split/refunded PDF values. The API unit tests check owner/manager/customer-terminal/foreign-tenant profile authorization, cutoff validation and tenant/branch-preserving targeted payment lookup.

Browser fixtures use the actual React components at 1366×768 and 768×1024, plus guest QR at 390×844. They check paid-void exclusion, refund confirmation, till confirmation, unsettled-day actions and existing guest/cashier flows. Backend/external traffic is blocked or mocked. They do not prove production login, gateway transfer, live inter-device delivery or printer behavior. Initial concurrent browser execution timed out during navigation; the isolated rerun passed.

## Further gaps confirmed

| Priority | Finding and source | Next implementation |
|---|---|---|
| P1 / R01 | Local cash/manual-UPI returns from a **closed** collecting shift have no complete replacement-register workflow. `billingCommands.ts`/`OrderRepository.applyRefundOrder` now refuse an unsafe rewrite. | Record the original sale, return event and paying register separately; make a return from a new till an authorized cash-out event with amount, actor, business date and idempotency key. Include stock/loyalty reversal and cross-day reconciliation. |
| P1 / R02 | Reporting remains fragmented. `billingLedger.ts` treats a partly paid bill's whole amount as pending. `DayOrdersService`'s open-bill/tender projections still use whole bill totals; `CentralReportingService` rounds aggregate rupees and `ReportGeneratorService.calculateSummary` still projects wallet as zero. | Derive collections, refunds and outstanding amounts from one payment-ledger projection across dashboard, daily reports, billing, CSV and PDF. Include partial payment/partial return/split/paise fixtures. The shift and daily-refund fixes here must not be mistaken for a repository-wide reporting replacement. |
| P1 / R03 | Changing rollover hour can change the date fallback for **untagged legacy** orders/shifts. `getCanonicalBusinessDate` uses the current configuration. `packages/utils/src/timezone.ts` fixes the restaurant timezone to Asia/Kolkata although cloud restaurant records have a timezone column. | Preserve historical date attribution, schedule cutoff changes from a future business date and migrate untagged rows deliberately. Add timezone-aware configuration only with tests across UTC/midnight boundaries. |
| P2 / R04 | Rollover hour is restaurant-wide, while five branches may operate different hours. The new restaurant field intentionally does not create a branch operating-profile system. | Add inherited branch operating profiles with explicit overrides, preview, authorization and acknowledgement. |
| P2 / R05 | Profile acknowledgement is not full cross-device branding acceptance. The profile API explicitly carries identity/AI/cutoff fields, while logo, owner names and style fields also have device-side settings. Save feedback now distinguishes the acknowledged subset. | Verify each branding field's durable transport and fresh-device restoration; offer a realistic preview and show pending device acknowledgements. |
| P2 / R06 | Stable KDS station IDs/legacy alias migration, complete staff-language coverage, verified owner recovery, an isolated staff-practice mode and guest-visible service acknowledgement remain unfinished product work. | Implement against existing station/licensing/staff/request APIs and test with untrained owners/cashiers/captains. Preserve separate app experiences. |

## Release requirements

1. Deploy migration `cloud/api/prisma/migrations/20261012200000_business_day_rollover_hour/migration.sql` before the updated API. It adds a default-5 integer hour and database range constraint. Existing signing identities, SQLite storage and package IDs are unchanged.
2. Regenerate Prisma, build the API, then publish the updated administrator/POS clients. No production migration, deployment or GitHub push was performed in this task.
3. Verify an authenticated staging owner, a branch manager refusal, two physical registers, another branch, real offline/reconnect, provider test-mode/manual-return bookkeeping and printed reports before production acceptance.

No perfect score or zero-gap claim is made.
