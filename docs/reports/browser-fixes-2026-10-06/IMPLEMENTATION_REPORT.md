# Jamanvaar fixes and verification — 2026-10-06

All twelve confirmed findings in the [discovery audit](../browser-qa-2026-10-06/JAMANVAAR_COMPLETE_QA_AUDIT.md) have been implemented and their demonstrated local failure paths now pass. Three additional defects found during verification were corrected: imported Captain orders disappearing from POS business-day views, branch ownership lost on deletion, and incorrect price-review warnings/checks.

Changes have not been deployed to AWS. This report does not certify every page control, real settlement, physical printing or production latency. The original audit remains a historical record; its findings are superseded only for the scenarios verified here.

## Final verification

| Check | Result | Evidence |
| --- | --- | --- |
| Runtime/business/frontend suite | 1,382 / 1,382 passed, 188 files | [Runtime results](runtime-complete-tests.json) |
| Core payment/auth/pricing/entity API suites | 103 / 103 passed, 8 files | [Core backend results](api-complete-tests.json) |
| Extended sync/QR/inventory/webhook API suites | 104 / 104 passed, 12 files | [Extended results](api-extended-tests-final.json) |
| Playwright fix scenarios | All 35 distinct scenarios have latest result PASS | [Reviewed matrix](TEST_MATRIX.csv) |
| Browser attempt history | 120 attempts; 15 earlier failures retained and reviewed | [Dispositions](ATTEMPT_DISPOSITIONS.csv), [raw attempts](test-matrix.jsonl) |
| Latest kiosk runtime regressions | 16 / 16 passed | [Kiosk results](kiosk-final-regressions.json) |
| Frontend production builds | All 7 active workspaces passed, including QR guest | [Build results](production-builds-final.json) |
| Root/API TypeScript checks and compiled API | Passed | [Typechecks](typecheck-final.json), [API build](api-build-final.json) |

Core and extended API totals overlap on entity-sync; the deduplicated result is **186 / 186 tests across 19 files**. [Verification summary](verification-summary.json) records that count. These are targeted API suites, not the entire API test catalogue. The initial kiosk compile error was corrected and its successful recheck is recorded. Earlier failed runs/timeouts remain alongside final results.

Playwright used an isolated PostgreSQL database with actual RLS, signed devices, authentication/role guards and simulated payment callbacks/refunds. Provider/SMTP/WhatsApp/AWS outbound actions were disabled in the corrected harness. Production data and user services on port 4000 were not modified. Owned QA services were stopped afterward; the original port 4000 listener remained running. QA fixtures/profiles are retained; credentials remain ignored. Final whitespace checks and report-link/credential scans passed.

## Confirmed defects fixed

“Verified” refers to the listed local failure path, rather than every variation of the feature.

| ID / severity | Affected apps | Root cause and fix | Main files / APIs | Evidence / expected impact |
| --- | --- | --- | --- | --- |
| B001 Critical | Restaurant Admin | Unstable entitlement callback restarted fleet effects. Stabilized callback/state identity and guarded overlapping requests. | `pos-admin/src/hooks/useEntitlements.ts`, Admin `App.tsx`; fleet API | Production preview: 0 idle fleet requests in 10 s versus 1,316 in discovery. Removes demonstrated amplification. |
| B002 Critical | POS, Captain, Kiosk, reports | Generic 5% tax ignored assigned groups; quotes and reports disagreed and lost explicit zero. Item-aware configured/inclusive tax, paise allocation, frozen snapshots and authoritative payment quote now agree. | `packages/business/src/pricing.ts`, repositories/reporting, client stores; payment `pricing.util.ts`, `menu-sync.service.ts`, `payments.service.ts` | Browser base ₹100 GST18 → ₹118; untaxed ₹299 → ₹299. Inclusive/mixed unit/API regressions pass. Reduces payable/receipt/report disagreement. |
| B003 Critical | Kiosk, KDS, POS | Paid completion skipped kitchen; unchanged lines did not reconcile missing KOTs. Admit paid CONFIRMED work and reconcile accepted versions/startup. Financial completion no longer silently serves submitted food. | Kiosk `App.tsx`, sync `outbox.ts`, repositories; fulfilment API and `kitchen-admission.util.ts` | One paid KDS ticket and Ready to POS. Durable acknowledgement validates paid price, quantity and modifier identity. |
| B004 Critical | POS, KDS, reports | Instant Bill created another order after SEND KOT. Reuse running order and stable line identities. | POS store/cart | SEND KOT → Instant Bill and double SEND each preserve one order. Prevents duplicate sale/KOT paths. |
| B005 Critical | POS, Admin, API | Signed device alone could refund; client actor claims were trusted. Require current verified manager session, scoped approval or current owner proof; verify active role, derive actor and enforce refund intent idempotency. | `refund-authorization.guard.ts`, payment/staff services, refund endpoint; POS override/bills and Admin cloud client | Cashier denied; manager/owner allowed; expiry/revocation/cross-intent/replay/concurrent balance tests pass. Owner browser refund was simulated; audit actor enforcement was checked by API tests. |
| B006 High | Kiosk, KDS | Unpaid online checkout was CONFIRMED. Keep DRAFT until capture or explicit cash acceptance; exclude DRAFT from kitchen and stock reservation/deduction. | Kiosk checkout, order rules, repositories, projector | Unpaid browser checkout has no actionable KDS ticket; accepted paid flow still cooks. |
| B007 High | Admin, POS inventory consumers | Movements traveled without stock/recipe/supplier definitions. Add authorized master transport, opening baseline, master-before-movement replay and clean-device catch-up. | `inventory_sync.ts`, `inventory_master_sync.ts`, `inventory_ledger_sync.ts`; entity-sync masters | Replacement admin reconstructed 18 kg stock and supplier; new stock persisted. Prevents missing master/baseline replay errors in tested paths. |
| B008 Medium | Admin | Memoized inventory used an in-place mutated array. Remove stale derivation. | `InventoryRecipesModule.tsx` | New stock appears immediately after save. |
| B009 Medium | Admin, accounting | Missing/zero cash fell back to ₹2,000 and invented reconciliation. Use actual cash state; preserve zero opening floats and uncounted missing shifts. | `NeedsAttentionSection.tsx`, `PrimaryMetricsGrid.tsx`, business-day repository | No-shift browser and zero-float regressions pass. |
| B010 Medium | Admin | Revoked owner silently lost entitlements/nav. Add explicit session/error recovery and generation-safe refetch. | `useEntitlements.ts`, Admin `App.tsx` | Injected 401 shows recovery; clean owner sign-in restores modules. |
| B011 Low | Kiosk | Auto-print dereferenced absent printer. Guard optional printer and use honest queue wording. | Kiosk `App.tsx` | Simulated checkout without printer has no undefined-name TypeError. Paper output untested. |
| B012 Medium | Super Admin, Admin | Provisioning pointed to retired Kiosk Admin. Use merged Restaurant Admin links/instructions. | Super `appUrls.ts`, onboarding/detail pages, `license_entitlements.ts` | Actual provisioning link reaches merged admin; no standalone port 5173 link. |
| B013 High, additional | Captain, POS, reports | Foreign terminal business-day IDs and mutable-array memo hid imported orders. Use canonical business date for imported rows, preserve explicit local-session IDs, recompute views. | `BusinessDayRepository.orderBelongsToBusinessDay`, POS views, reporting/accounting | Captain → KDS Ready → Captain/POS settlement passes once at ₹118; imported daily accounting regression passes. |
| B014 High, additional | Branch master/table sync | Minimal deletion lost ownership. Retain existing branch scope, including unbound owner deletion, and restrict master authority/read scope. | Entity-sync service/authority/DTO | Actual API verifies denied cross-branch reads/writes and scoped tombstones. |
| B015 Medium, additional | Backend price review | Gross inclusive lines compared with net subtotal; unique line IDs used to find menu prices. Subtract valid embedded-tax snapshot and resolve menu-item identity. | `order-rules.ts`, `order-sync.service.ts` | Actual API accepts inclusive ₹118 / ₹100 subtotal without false flags, still flags an underpriced line. Wrong subtotal/invalid tax extraction regressions pass. |

Other evidenced improvements: moved identical inline brand image bytes into cacheable assets, removed render-time notifications and misleading fixed-tax labels, and made KOT “sent” reflect unsent quantities. Admin main JavaScript gzip size fell from 3,293.35 kB to 403.01 kB (87.76% reduction). Separate images/other chunks are excluded; this is not a measured WAN improvement. Large-bundle warnings remain.

## Cross-app chains and timing

1. Owner changed untaxed pizza ₹299 → ₹301. Kiosk showed ₹301 without refresh; simulated capture charged 30,100 paise. POS and exactly one KDS ticket retained the same item/amount. Collection report deltas: gross ₹301, fee ₹9.03, net payable ₹291.97. Price restored afterward.
2. Captain created base ₹100 + GST ₹18 = ₹118. KDS Ready returned to Captain and POS; cashier settled the same order once. Imported business-day accounting retained ₹118 cash and ₹18 tax.
3. Offline POS KOT had no cloud copy before reconnect, one after reconnect and still one after refresh. POS/KDS authenticated SSE recovered after an isolated API restart.
4. QR guest double submission and refresh preserved one ₹118 order. Cashier acceptance produced one KDS ticket; Ready returned to the same public status page.

Individual local samples: owner edit → visible kiosk price 394.73 ms; simulated capture → KDS ticket 705.36 ms; Captain creation → KDS ticket 2,220.06 ms; offline reconnect → observed cloud persistence 173.75 ms. These are harness samples, not p95/p99 or promised consistency bounds. SSE reconnect after API restart was 7,189 ms POS / 7,975 ms KDS, including deliberate 1.8 s outage, API boot and reconnect. An open SSE request is intentionally long-lived.

Repeated counter checks created 20 sequential sales (20 unique orders, ₹5,980 total) and 30 sequential KOTs (30 unique source orders at KDS). These do not establish simultaneous peak capacity.

## Collection and Route contracts

Dashboard wording separates **Gross Collection → Jamanvaar Fee → Net Payable → Paid / Pending**. Super Admin changed the kiosk rate 3% → 4%; a new ₹118 simulated payment recorded ₹4.72 fee while an earlier 3% snapshot remained unchanged. Default restored to 3%. Fee remains scoped to the intended kiosk QR flow.

Route remains pending as requested. Jamanvaar collection and MANUAL payout remain effective. The bank toggle requests direct settlement; it does not activate it before Route/linked-account/bank verification. No real transfer was executed.

Online kiosk payment quotes currently lack a server coupon/loyalty redemption contract. Checkout displays the authoritative amount, clears discounts the quote did not apply and avoids consuming corresponding benefits. **Full online promotion redemption remains a capability gap**, requiring server implementation and lifecycle tests; it is not claimed as implemented here.

## Likely risks / needs further verification

| Area | Local evidence | Outstanding |
| --- | --- | --- |
| AWS/Nginx/ALB/database pool | Fleet amplification removed; PostgreSQL integration passes | Deployed pool waits, slow queries, CPU/memory, proxy buffering/idle limits, multi-instance relay and end-to-end p95/p99 unavailable |
| Payments/payouts | Simulated capture/refund, authorization/idempotency, frozen rates and report deltas pass | Real callback/reconciliation, approved-bank EOD/mark-paid/reversal lifecycle and provider verification; Route pending |
| Ordering/inventory | Core role chain, runtime suite, master/ledger APIs pass | Every browser amendment/combo/coupon/split/cancel/table move, mixed/inclusive discount and concurrent recipe/stock variant |
| Resilience/security | Short offline, one restart, two tenants and branch probes pass | Long outage/soak, concurrent operators, active-stream expiry, backup restore and wider abuse review |
| Devices/UX | Missing-printer failure and tested role chains improved | Physical print/drawer, sound, full touch/keyboard/screen-reader and every page control |
| Historical financial/stock data | No automatic rewriting | Review old duplicate/mis-taxed/completed orders, missing KOT admissions and baselines before reconciliation |

Deploy backend/frontend contracts together: refund scopes, quotes, master types and kitchen acknowledgement changed. No Prisma migration was added; masters use the existing generic entity table. Build with actual production URLs; QA bundles used localhost:4010. Review historical data explicitly rather than automatically recooking/refunding or rewriting old finances.

Use [scores](SCORES.md) and [updated plan](../browser-qa-2026-10-06/FIX_PLAN.md) for remaining release gates. The original unexecuted-scenario inventory remains historical; the positive commission, owner price/payment/report, Captain cash settlement and QR/offline chains above now have additional coverage.
