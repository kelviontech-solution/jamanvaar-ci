# Admin returns and POS reconciliation — 18 October 2026

This follows [channel durability](CHANNEL_DURABILITY_2026-10-18.md). The repair programme remains incomplete and the provisional scores remain **Security 7.0/10, Code quality 7.0/10 and SaaS readiness 6.5/10**. Changes are local and uncommitted; nothing was deployed or pushed.

## Additional source fixes

1. Restaurant Admin `refundBillingOrder` and `voidBillingOrder` now prepare their local effects inside the acknowledged SQLite command boundary when that backend is attached. Refund bookkeeping, stock/loyalty reversal, register effects, ticket cancellation and table release no longer report local success ahead of that save. A lost response reuses the original command. Legacy backend compatibility remains explicitly weaker and is not certified by the SQLite checks.
2. Admin's Orders table void action now calls the same authorized billing helper and refreshes its data after success instead of directly mutating the repository with a hardcoded actor.
3. Admin return attempts use a stable opening-ledger-balance key, instead of an asynchronously saved random key that could be lost before retry. Changed return details cannot quietly become another attempt against the same opening balance. The cloud response `processed` is recognized as recorded, matching the actual endpoint contract. This is manual-return recording, not a Razorpay transfer.
4. POS reconciliation after server-confirmed UPI now uses `commitVerifiedOnlineCollection`. It retains the original bill/payment references, refuses closed/refunded bills or another collection reference, and adopts the receipt after acknowledgement. A local save failure after server success never opens a new cash collection path. Pending/unknown server statuses require another check instead of treating them as failed payment.
5. Admin order details now display actual collected and outstanding amounts using the shared payment-position calculation. Previously a pending or partially paid order could show its entire amount as settled and zero remaining. Editing/closing cancellation and refund forms is restricted while a save is in progress.
6. Kiosk's quote helper preserves omitted fields instead of overwriting saved items/subtotal with `undefined` when applying a partial quote. Explicit coupon/reservation clearing is still supported; invalid round-off is rejected.

The original signing keys, package identities, installed data directories and provider configuration were not changed. Client-side durable commands do not grant server permissions or establish that a guest paid; server payment verification remains separate.

## Verification

Final aggregate results and source hashes are in [ADMIN_RETURN_VERIFICATION.json](ADMIN_RETURN_VERIFICATION.json). Private raw logs stay under ignored `.jamanvaar/`. Overlapping focused and full runs are separate evidence, not additive test totals.

- The focused Admin/POS follow-up passed **52 tests across three files** before the final omitted-quote-fields correction. It includes real local SQLite, lost acknowledgements, paying-register cash-out deduplication, authorized Admin void, POS verified-payment recovery and the actual Admin partial-balance component. The initial new Admin fixture lacked browser session storage; adding a run-owned in-memory `localStorage` fixture fixed the setup while retaining genuine session validation and SQLite effects.
- The preceding channel-stage financial subset passed **38 tests across three files**. Its five unrelated timing-affected files subsequently passed **27 tests across five files** with one worker and explicit 30-second test/hook budgets. No production cryptographic parameters or test assertions were relaxed.
- Browser checking covers **16 scenarios**: 12 actual POS/Captain/Admin component or Kiosk service cases in the updated kitchen fixture, plus four POS payment/protected-recovery checks. Each checks page errors; mobile cases also check horizontal overflow. Staff identities/approvals and physical hardware are fixtures. Full activated Kiosk, authentication, provider settlement and native acceptance remain outside this evidence.
- The latest full root refresh, all-project TypeScript gate and four affected production frontend builds are recorded in the final ledger when completed. Earlier broad failed runs are retained; they are not described as clean gates.

Final results (completed after midnight, 19 October local time):

| Check | Result |
| --- | --- |
| Full root refresh | **2,378 passed, 1 failed, 0 skipped; 334 files. Not a clean gate.** The first `pos_admin_entitlements` test exceeded its existing 60-second budget (60,086ms); it includes cold dynamic module initialization. |
| Unchanged entitlement-file follow-up | **8 passed, 0 failed; one file**, run alone. The first test took 25,270ms. This supports a load-sensitive setup/timing diagnosis, not a declaration that the preceding broad run passed. |
| Focused Admin/POS follow-up | **52 passed, 0 failed; three files**; overlaps the broad run. |
| Root all-project TypeScript | Exit **0**, no diagnostics. |
| POS, Restaurant Admin, Captain and Kiosk Vite builds | All four exit **0**; existing large-chunk warnings remain. These are frontend bundles, not signed native upgrades. |
| Real Chrome/SQLite OPFS component/service fixtures | **16 scenarios**, zero page errors; mobile overflow assertions passed. |
| Whitespace/diff check | Exit **0**. |

No test assertion, production cryptographic parameter or entitlement behavior was changed to hide the last broad-run failure. Test initialization/performance and a fresh clean broad gate remain acceptance work.

Reproduce browser checks from the repository root:

```powershell
node docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs
node docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.cjs
```

The Admin fixture uses the actual `OrderDetailModal` and billing helpers with SQLite OPFS. It tests refund and unpaid void under delayed and committed-but-lost responses. A retry records one return or one cancellation; no production restaurant is opened or changed.

## Remaining work

This stage removes Admin local billing/Orders void and POS online reconciliation from the previous caller-gap table. **EC-01/W03 is still open** for POS running-dish removal, legacy backend policy, inbound sync/command admission, Kiosk abandon/back/held-draft routes, generic pending-operation recovery and installed crash/concurrent-device acceptance.

Call-site clarification: `RestaurantCommandPipeline` is exported and exercised by `tests/unified_local_core_ecosystem.test.ts`, but no call from an app was found in the repository search. It is an unaccepted legacy/exported entry point, not evidence that current POS/Kiosk buttons use it. Inbound outbox materialization is a separate runtime path that still needs review. Tests of the exported pipeline must not be presented as end-to-end proof of actual app submission.

Other packages remain as described in [the reassessment](REASSESSMENT_2026-10-18.md): Core/cloud revision bridging; complete payment/return lifecycle and reconciliation; all-report metric/cutoff agreement; installed/offsite/key-loss restore; physical hardware and fleet incidents; all-role/F01–F25 journeys; adversarial route and signed-artifact checks; realistic sustained load; signed existing-installation upgrade and restaurant pilot.

Screenshot review additionally exposed a concrete W06/W09 gap: `OrderActivityView`'s local fallback can show a balance due for a cancelled unpaid bill even though the shared payment-position settlement panel correctly shows zero outstanding. Reproduced in `.jamanvaar/kitchen-admin-void-lost-390.png`; this is a separate activity-summary calculation requiring reconciliation, not a failed SQLite void. The current stage does not claim every part of that page is correct.

The cloud/manual-return record and local register record remain separate transactions. A cloud acknowledgement followed by a changed local mirror or missing local acknowledgement requires reconciliation of the original reference. Stable keys and balance guards reduce duplicate effects; they do not constitute a completed cross-system financial recovery workflow.

To justify a 10/10 rating, close every applicable master-plan acceptance gate with reproducible evidence on the supported environment. More passing local checks alone cannot establish production payment, hardware, disaster recovery or native update reliability.
