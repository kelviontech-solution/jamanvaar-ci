# Role-based recommendations

Cashier, Kitchen Staff, Captain and Restaurant Owner take priority. Each recommendation is either tied to reproduced evidence or labelled as a test/verification need; untested functionality is not declared absent.
## Cashier

**Worked well in the tested path:** Hold/recall, cash settlement of a running order, short offline KOT, zero-float shift close and guest QR acceptance worked.

**Difficult / unsafe / unverified:** Instant Bill after KOT creates a second order; configured GST is ignored; refund approval can be bypassed server-side.

**Missing reliable guarantee:** One sale identity, accurate tax, server refund approval, truthful printer feedback and known recovery/shift state.

Top 10 improvements / verification actions:

1. Preserve the running order on Instant Bill (B004).
2. Apply configured tax before payment (B002).
3. Enforce manager refund approval on the server (B005).
4. Show pending sync separately from durable completion.
5. Verify printer delivery and cash drawer feedback with hardware.
6. Keep shift/no-shift and zero-opening cash explicit.
7. Validate held-cart recall after expiry/restart.
8. Test partial/split payment and cancellation approval before rollout.
9. Investigate fresh-cart KOT-sent label carry-over.
10. Reconcile cashier day reports to the same order/payment ledger.

## Kitchen Staff

**Worked well in the tested path:** POS/QR tickets, ready→cashier visibility, tabs/station selection and 30-ticket recovery worked.

**Difficult / unsafe / unverified:** Paid kiosk orders disappear while unpaid QR checkout can appear. Staff cannot infer payment acceptance safely.

**Missing reliable guarantee:** Reliable paid/cash-accepted admission; stable ticket identity and explicit recovery state before more display options.

Top 10 improvements / verification actions:

1. Ensure every paid kiosk order arrives once (B003).
2. Keep unpaid QR checkout out of cooking (B006).
3. Show payment/cash acceptance separately from preparation.
4. Keep ticket/item identity across restart and recall.
5. Test multiple stations simultaneously.
6. Verify item-level prep/ready transitions and amendments.
7. Make stale/offline/recovering states visible.
8. Test peak ticket density with actual kitchen staff.
9. Verify sound permissions and visual alerts on actual hardware.
10. Reconcile served/cancelled/recall views against backend status.

## Captain / Waiter

**Worked well in the tested path:** Mobile table/menu selection, role PIN rejection, ready notification, final table release and offline navigation worked.

**Difficult / unsafe / unverified:** Original full timed flow was interrupted; quantity/modifier/amendment/transfer/service request workflows remain unverified.

**Missing reliable guarantee:** Fast repeat ordering, clear send acknowledgement, safe amendments and an end-to-end table lifecycle backed by the same order id.

Top 10 improvements / verification actions:

1. Complete a clean timed Captain→KDS→POS→table-release regression.
2. Verify item-specific tax in Captain checkout (B002 shared-code risk).
3. Show durable KOT acknowledgement and pending offline sends.
4. Test repeat rounds and item amendments without duplicates.
5. Validate modifiers/quantities on touch screens.
6. Verify table transfer/merge and assigned-branch scope.
7. Reconcile Ready notifications with current item status.
8. Test service requests/messages as real operations.
9. Verify role and shift permissions server-side for sensitive actions.
10. Observe usability with actual waiters during concurrent table service.

## Restaurant Owner

**Worked well in the tested path:** Menu price propagation, menu CSV, staff/customer creation, stock delivery/count ledger and collection labels worked in selected paths.

**Difficult / unsafe / unverified:** Idle request storm; inventory disappears on another device; false reconciled cash float; auth errors hide modules.

**Missing reliable guarantee:** Trustworthy numbers, immediate save feedback, cross-device stock and explicit login/module state.

Top 10 improvements / verification actions:

1. Stop idle fleet request amplification (B001).
2. Sync inventory masters across devices (B007).
3. Show saved items immediately (B008).
4. Remove fabricated float/reconciliation (B009).
5. Provide sign-in recovery instead of hiding modules (B010).
6. Keep Gross/Fee/Net/Paid/Pending labels tied to authoritative ledger.
7. Validate supplier/recipe transport and replacement-device recovery.
8. Test commission snapshot visibility and refund-adjusted net payable.
9. Reconcile reports to shift/order/payment facts.
10. Complete import, bulk edit, backup and destructive-action checks.

## Customer

**Worked well in the tested path:** Guest QR correctly quoted GST18, double-submit/refresh retained one order and status became Ready.

**Difficult / unsafe / unverified:** Kiosk payable differs from charged amount; paid confirmation may not reach kitchen; no-printer runtime error.

**Missing reliable guarantee:** One accurate payable amount and confirmation that represents actual order acceptance and kitchen delivery.

Top 10 improvements / verification actions:

1. Show exactly the amount that will be charged (B002).
2. Confirm acceptance only with durable kitchen delivery (B003).
3. Handle unpaid QR cancel/expiry without preparing food (B006).
4. Provide honest receipt availability when no printer exists (B011).
5. Test all offered languages and order modes.
6. Validate modifiers and accidental repeat taps.
7. Keep order reference and status through refresh/reconnect.
8. Explain delayed/failed payment without a false success state.
9. Verify touch targets and accessible interaction on kiosk hardware.
10. Test real payment-provider sandbox success/failure/late-capture cases.

## Super Admin / Finance

**Worked well in the tested path:** OTP, A/B onboarding, payment approval, negative commission authorization and unverified-bank EOD protection worked.

**Difficult / unsafe / unverified:** Most admin actions only rendered; positive commission edit, payout fulfilment, full statements and provider operations not certified.

**Missing reliable guarantee:** Actionable exceptions based on durable fulfilment, immutable fee snapshots, accountable refunds and verified payout audit.

Top 10 improvements / verification actions:

1. Enforce refund actor/approval on the backend (B005).
2. Make paid-but-no-durable-KOT exceptions accurate (B003).
3. Execute positive commission-edit and immutable historical-snapshot tests.
4. Keep Route request separate from active direct settlement.
5. Validate approved-bank EOD, payout marking and bank-reference audit.
6. Reconcile refunds/holds/fees and statements after adjustments.
7. Complete all platform role/permission mutations.
8. Verify multi-tenant/branch scoping for remaining finance resources.
9. Instrument deployed API/DB/ALB latency before tuning.
10. Run backup restore, multi-instance relay and concurrent peak certification.
