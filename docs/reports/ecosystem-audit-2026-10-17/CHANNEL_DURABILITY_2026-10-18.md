# Channel durability continuation — 18 October 2026

This continues the [repair master plan](REPAIR_MASTER_PLAN.md) and [POS checkout stage](FINANCIAL_CHECKOUT_2026-10-18.md). **The programme is incomplete.** Changes are local, on top of `ccf17d93288ede1a1bdf7bb2c150adf84ec88e72` and inherited uncommitted work. Nothing was pushed or deployed; no real customer payment or signed upgrade was attempted.

Follow-up: [Admin returns and POS reconciliation](ADMIN_RETURN_RECONCILIATION_2026-10-18.md) addresses additional callers listed below. This report and its ledger preserve the preceding stage's scope rather than claiming the later work was verified by an earlier run.

## Changes implemented

### Kiosk

- `kioskAdmission.ts` saves the unpaid draft, gateway-priced quote and kitchen admission through the existing acknowledged SQLite command boundary. Token/order IDs are allocated inside preparation and retained on retry. A new UI session/line ID cannot turn a retry of an unresolved draft into a second order.
- Quote changes cannot promote payment, change channel/ownership, alter the ordered lines, introduce invalid amounts or reprice an admitted order. A quote is not evidence of collection. The server status endpoint remains the payment-verification authority.
- Admission prepares order state, kitchen tickets, coupon use, receipt intent and applicable loyalty changes together. Paid admission uses the saved customer's identity and spends points before earning them. Cash-at-counter admission remains unpaid. Repeating admission does not add another ticket, coupon use or loyalty effect.
- The actual Kiosk app awaits these operations before showing its confirmation. Failed local admission keeps the original payment reference; polling can retry instead of stopping after an unacknowledged save. A late payment on a cancelled order requires reconciliation rather than reopening it.
- Kitchen print claims, physical printing and success UI occur after acknowledged admission. Replaying an uncertain operation does not automatically print another receipt/ticket. A failed server print claim requires staff review instead of falling through to a possible duplicate print.
- Session reset/cancellation refuses to discard an unresolved financial operation. A complete guided recovery screen for this state remains necessary; blocking a reset alone is not a finished recovery experience.

### POS and Captain kitchen submission

- Actual POS `PosCart` and Captain table-workspace buttons await new durable store actions. Sent quantities/course flags and cart adoption follow acknowledgement. A retry uses the original order/line/ticket references; replay does not trigger automatic printing again.
- POS kitchen submission now validates required choices, availability and quantity bounds at submission as well as in the visible dish editor. Tickets retain the original order-line IDs.
- Captain course submission uses the current stored table/order, rejects paid/closed or changed bills, and reconciles inventory for appended dishes. Sending the next course preserves the same bill.
- Captain dish cancellation now commits line/ticket cancellation, repriced totals and applicable table release together. Its modal prevents closing/editing during the save and catches failures. Paid bills cannot be reduced through this action. A delayed response cannot replace another table's active workspace.

### POS returns

- Actual Bills and live-order refund/void callbacks now await the shared `financialActions.ts` command instead of claiming success after background persistence. Invalid/zero refund input cannot silently become a full refund.
- Bills records an explicit return method and paying register using the existing return ledger. This supports repeated partial returns and one cash-out per idempotency key. A changed refund balance requires reconciliation rather than silently rebasing another return.
- The cloud refund endpoint records a **manual restaurant-paid return**; it does not initiate a Razorpay refund. The UI now explains this and requires confirmation that money was returned. Retry messages explicitly say not to pay the guest twice. The request key is stable for the original opening refunded balance, including after reload; changing amount/reason conflicts instead of inventing another cloud return.
- Bills refreshes summaries when acknowledged data changes, including refunds that do not change the number of orders. Its partial-refund input starts at the remaining refundable balance.
- Local return bookkeeping and cloud return recording remain two distinct transactions. An uncertain cloud result or intervening mirror update still needs guided reconciliation. The new guard prevents blindly applying another local refund; it does not certify a complete distributed refund saga.

## Verification and its limits

The current stage's aggregate evidence is recorded in `CHANNEL_DURABILITY_VERIFICATION.json` after the final checks finish. Raw logs and fixture data remain in ignored `.jamanvaar/`; test totals from overlapping runs must not be added together.

Recorded results: **38/38** bounded financial tests, **12 browser scenarios**, a clean root TypeScript gate and successful POS/Captain/Kiosk Vite builds. The broad refresh was **2,362 passes and 11 failures across 333 files**, with an invalid intermediate tax fixture and timing failures; it is explicitly a failed run. The final financial fixture passed after correction, and the other five affected files passed **27/27** in a separate bounded run. A new full refresh belongs to the follow-up report.

New SQLite regressions exercise Kiosk draft/quote/admission, a lost response followed by reopening the actual SQLite file, coupon/loyalty exact-once effects, cancellation rollback, Captain course replay and cancellation/repricing, POS ticket replay/validation, partial cash-return movements and stale refund balances.

Browser reproduction:

```powershell
node docs/reports/ecosystem-audit-2026-10-17/kitchen-flow-browser.cjs
node docs/reports/ecosystem-audit-2026-10-17/financial-checkout-browser.cjs
```

The first fixture uses real POS cart, Bills and Captain workspace components with real browser SQLite OPFS. Its Kiosk coverage exercises the admission service in a small fixture, **not the complete activated Kiosk app**. Staff approvals/identities and physical hardware are simulated. The second fixture rechecks the prior POS payment/recovery component scenarios. Neither fixture is provider acceptance, a signed native crash test, an authenticated all-app audit, or physical printing acceptance.

The initial full refresh found three older fixtures skipping required choices after submission validation became stricter. They now explicitly use dishes without required customization for their unrelated loyalty/routing/identity scenarios. A dedicated actual durable-submission regression retains rejection coverage. A new cancellation test initially compared a tax-exclusive subtotal with the inclusive line price; it now verifies the remaining payable amount and tax identity as well as persisted cancellation. Intermediate failures are retained separately from final evidence.

## Remaining source adoption

EC-01/W03 is still open. An actual-call-site search still finds synchronous or unreviewed paths requiring their own regression and UI acceptance:

| Area | Remaining work |
| --- | --- |
| POS running-dish removal | `posStore.ts` calls `cancelOrderLine` outside the new acknowledged cancellation action. |
| POS online counter reconciliation | `PosOrdersView.tsx` still has a direct `settleOrder` route after server verification. |
| Restaurant Admin billing/orders | `billingCommands.ts` and `OrdersModule.tsx` still contain synchronous refund/void calls. |
| Legacy/offline fallback policy | Older synchronous POS actions/Instant Bill fallback and Captain compatibility paths remain; define supported migration/degraded policy explicitly. |
| Sync/inbound command admission | `packages/sync/src/command_pipeline.ts` and inbound outbox ticket materialization require their own atomic-admission review. |
| Draft/table recovery | Finish Kiosk abandon/back/cancellation, refresh restoration, held drafts, table moves and guided recovery of unresolved operations. |

Presence in this table is an adoption gap, not proof that every listed call currently loses data. Do not mark the programme complete by counting the new tests.

## What is required to justify a higher score

The provisional scores remain **Security 7.0/10, Code quality 7.0/10, SaaS readiness 6.5/10**. This stage improves specific financial flows; it does not remove the programme's wider acceptance gaps.

1. **W03:** finish the caller table above and prove restart, storage failure and concurrent-device behaviour on supported installations.
2. **W04:** bridge Core/cloud revisions, preserve origin attribution through failover, and review quarantined history and multi-terminal amendments/deletions.
3. **W05:** finish all-channel lifecycle, manual-return/provider-attempt reconciliation, cancellation/late-success and duplicate/fallback matrices.
4. **W06:** reconcile persisted financial fixtures across every report/export and historical business cutoff; a live Bills refresh is not a metric-dictionary overhaul.
5. **W07:** complete supported installed restore, migrations, objects/keys/stock/loyalty, offsite and key-loss drills, with measured recovery objectives.
6. **W08:** exercise real printer/drawer/sidecar failures and fleet incident detection/recovery.
7. **W09:** revalidate F01–F25 and all supported role/page/touch/receipt journeys against the current build.
8. **W10:** complete adversarial endpoint/role/tenant/branch/product tests and signed-artifact/revocation acceptance.
9. **W11:** measure sustained representative tenant/fleet load, fairness, retry storms and recovery limits.
10. **W12:** upgrade existing Windows/Android installations with original signing identities, retain local data, demonstrate recovery and complete a bounded restaurant pilot.

A 10/10 claim cannot replace these checks. Missing external acceptance must remain explicitly unverified, and the still-open source work must remain explicitly incomplete.
