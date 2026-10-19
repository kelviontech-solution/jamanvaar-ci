# Cancellation, accepted pricing and recorded balances — 19 October 2026

This stage fixes additional W03/W06/W09 runtime paths. **The programme remains incomplete; scores stay Security 7.0, Code quality 7.0 and SaaS readiness 6.5.** No push, deployment, signing change or production restaurant mutation was performed.

## Changes and reproduced defects

- **POS sent-dish cancellation waits for SQLite acknowledgement.** The actual cart now uses the durable command; delayed and committed-but-lost responses cannot remove the draft early or cancel twice. Removed the unused synchronous entry point. Cancellation preserves other unsent work, cancelled line history, accepted identities and later KOT submission. The trash button previously passed the cancelled dish to a replacement callback, adding it back immediately; the browser now checks that exactly one dish disappears.
- **The last cancelled dish closes its bill and releases its table.** A subsequent submission starts a different bill. A loaded bill excludes cancelled lines, and saving it cannot resurrect their identifiers.
- **Cancellation uses accepted prices and tax snapshots.** POS and Captain share a saved-order repricing helper. It excludes cancelled lines, retains accepted unit prices and modifier extras, redistributes discount/tax snapshots, preserves accepted fixed charges on active bills, and refuses collected bills. A regression failed when the catalogue changed from 5% to 18% GST: cart recomputation overwrote the surviving accepted snapshot. The actual POS cancellation/settlement path now preserves it.
- **Recalling a counter or table bill retains its accepted discount.** Existing prices survive later menu edits; a saved 10% discount remains 10%, rather than becoming the saved rupee discount amount. Accepted coupon amounts remain fixed without running newer campaign rules. Tests exercise recall through actual durable payment.
- **Receipts, activity, settlement and outstanding-bill helpers share one recorded-balance calculation.** A cancelled bill owes zero. A cancelled payment attempt on a still-active bill remains collectible. Partial collections and full/partial returns use their recorded amounts. The cancelled-bill activity bug documented in the preceding stage is repaired and browser-checked.

These changes do not claim that every historical tax record, amendment path or report has been reconciled. Legacy orders without an accepted tax snapshot need their own policy; later quantity/new-course edits and all report cutoffs remain in scope for subsequent work.

## Verification

The [verification ledger](CANCELLATION_BALANCES_VERIFICATION.json) binds source hashes and aggregate evidence. Raw records remain private.

- Focused financial regression: **129 passed, zero failed/skipped, 12 files**. Earlier runs are overlapping evidence, not additional tests. The deliberately reproduced tax-snapshot failure is retained separately in local logs.
- Root and API TypeScript gates passed with no diagnostics. All seven production frontend bundles passed; existing bundle-size warnings remain. These bundles do not constitute signed native artifact acceptance.
- Browser fixtures: **18 scenarios** across actual POS/Captain/Admin components and Kiosk admission services, using Chrome and SQLite OPFS. They cover delayed and lost acknowledgements, cancellation, returns, payment and protected-recovery checks. No page errors; mobile overflow assertions pass. Staff approvals and hardware are fixtures; this is not an authenticated full-product or payment-provider certification.
- The preceding broad root gate remains **2,378 passes and one entitlement initialization timeout**, followed by an unchanged isolated 8-test pass. No fresh clean full-root run is asserted here. API database regression remains the earlier 1,588-test baseline.

Reproduce from the repository root:

```powershell
node docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs
node docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.cjs
```

## Remaining acceptance

EC-01/W03 is still open for inbound admission, legacy backend policy, Kiosk abandonment/held routes, generic pending-operation recovery and installed interruption/concurrent-device acceptance. W04–W12 retain revision bridging, payment/return reconciliation, complete report agreement, installed/offsite/key-loss recovery, physical fleet/printer checks, all-role journeys, adversarial and native checks, sustained realistic load, signed upgrades and the restaurant pilot. See the [master plan](REPAIR_MASTER_PLAN.md) and [reassessment](REASSESSMENT_2026-10-18.md).
