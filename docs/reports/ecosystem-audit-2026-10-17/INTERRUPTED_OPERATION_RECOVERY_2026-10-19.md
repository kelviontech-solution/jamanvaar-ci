# Manager review of interrupted POS operations — 19 October 2026

This follows [inbound sync persistence](INBOUND_SYNC_2026-10-19.md). The repair programme is still incomplete. Provisional scores remain **Security 7.0/10, Code quality 7.0/10 and SaaS readiness 6.5/10**. No push, deployment, signing change or production restaurant mutation was performed.

## Staff flow

An active manager signs in on the affected POS terminal and opens **Settings → Local DB & Sync → Finish an interrupted save**.

1. **Restore and review original bill** resumes the exact persisted command, using its original operation and payment references. It does not reconstruct the payment request from the current cart. SQLite distinguishes an already committed operation from a prepared operation still needing its original local save.
2. The panel shows the recovered bill, recorded collection, recorded return, balance due and order/payment status. These are this terminal's recorded values; recovery does not independently prove a provider payment or reconcile a settlement.
3. If a cart is present, the manager explicitly identifies it as the recovered bill's old cart or separate new work. The former is cleared; the latter is retained. Neither is silently inferred. The manager confirms review before finishing.
4. Only then is the local recovery lock acknowledged. A shortcut opens Bills & Invoices. Recovery never automatically prints, pulses the drawer or requests another payment.

Cashiers encountering a different-request lock receive the exact manager recovery location. Their original same-request retry remains available. Manager access is checked in the recovery service against an active local staff record and authenticated POS state, including again when finishing; this is an offline application control, not a claim that client code or local files cannot be patched. Backend entitlements and authorization remain authoritative for protected server operations.

## Safety boundaries

- The database review API exposes only original operation and order references, not the saved mutation payload, customer records or credentials. It checks the prepared bill's restaurant/branch against the open account and refuses mismatched or damaged records.
- A changed operation, cart, bill or manager requires review again. Existing work stays available; unknown outcomes are not discarded to unlock a new collection.
- If the final acknowledgement committed but its response was lost, a subsequent replay can prove that the lock is already removed. The reviewed original bill can still be adopted without another payment or print.
- A damaged record is retained for support; JSON parse errors do not echo its private contents into the interface.
- The draft and financial ledger use different storage paths. Clearing the recovered cart checks that the old recovery draft is gone before releasing its lock. This is not a completed transactional migration of every draft, held order or application channel.
- A hidden, not-yet-restored draft also requires review even when the visible cart is empty. Both its persisted copy and the pending restore prompt are included in the comparison and cleared only on the manager's explicit recovered-bill choice. An “empty cart” alone cannot release a forgotten old draft for later duplicate collection.
- An operator must correctly identify separate work. The system does not prove that two identical-looking carts represent different intended orders. The explicit review is deliberate; automatic matching would risk discarding new work or allowing a duplicate collection.

## Verification

The [verification ledger](INTERRUPTED_OPERATION_RECOVERY_VERIFICATION.json) records exact aggregate test/build/browser results and source hashes. The real SQLite integration checks include reopening the database, a prepared-but-uncommitted save, inactive/changed manager, changed cart/bill, wrong branch/reference, private damaged input and a lost final acknowledgement. The browser uses the actual recovery panel and services with SQLite OPFS at **390px and 1366px**, reopening after a lost checkout response. It checks the review controls, one original bill, cleared old cart and no repeated print/drawer action.

The final affected regression passed **94 tests across eight files, zero failures/skips**, including the hidden-draft guard added during review. Both type gates and all seven frontend bundles passed in the recovery stage, including a final POS refresh after the panel changes. The browser regression passed **20 scenarios**, including the two new manager-review journeys. An unpaid kitchen-submission regression separately checks one unpaid bill, one KOT and the actual balance due. The new full root run is reported independently when complete; the later hidden-draft guard has the separate 94-test/type/build/browser follow-up rather than being attributed to a frozen broad run.

The broad root run completed with **2,418 tests passed across 336 files, zero failures/skips** in 311.35 seconds. This is a new clean working-tree regression result; the previous 2,378-pass/one-timeout run remains historical evidence. Because concurrent QR edits and the later hidden-draft guard occurred during this run, it is not a frozen release certificate for every final file. The final recovery guard has the separate 94-test follow-up above. These counts overlap and must not be summed.

The first new final-acknowledgement test accidentally wrapped the same mock twice and recursed. That fixture failure was retained and corrected by restoring the original backend method before installing the next fault. The resulting lost-final-acknowledgement case also exposed an actual recovery edge: replay may find that the acknowledgement already removed its intent. The service now permits adoption of that reviewed original result while still refusing any different pending operation.

Counts from overlapping focused stages must not be added together. Frontend bundles do not constitute signed native upgrades; browser fixture managers/hardware are not authentication, provider or physical-device acceptance. The complete root regression result is tracked separately; preceding timing failures are retained rather than rewritten as passes.

Workspace concurrency: QR restaurant-page schema/types/styles gained an `INDIAN` template while these checks were running. The all-project type gate caught the missing guest-page palette mapping. This continuation added an exhaustive typed mapping with the new theme's existing background color, preserving the concurrent theme work. Root/API type checks and the QR guest bundle were refreshed separately. The broad suite therefore provides working-tree regression evidence, not a frozen release certificate for those concurrent edits.

## What remains

This implements generic original-command resumption plus a **POS manager interface**. Captain, Kiosk and Admin still need equivalent guided recovery suited to their roles and device interfaces; this panel is not presented as recovery in every app. W03 also retains legacy backend policy, held/abandon paths, serializable concurrent admission and installed interruption drills. The [remaining-work table](INBOUND_SYNC_2026-10-19.md#work-still-required) covers W03–W12, including provider/manual-return reconciliation, all-report agreement, installed/offsite/key-loss restore, hardware, signed upgrades, adversarial checks, sustained load and the pilot.
