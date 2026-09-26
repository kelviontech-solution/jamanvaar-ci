# Restaurant onboarding and multi-application test report

**Phase: audit complete; fixes for every confirmed defect implemented and re-tested (section 23). Sections 1-22 record the audit as found.**
Plan and matrix: [RESTAURANT_ONBOARDING_AND_MULTI_APP_TEST_PLAN.md](RESTAURANT_ONBOARDING_AND_MULTI_APP_TEST_PLAN.md). Requirement: [RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md](RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md).

Nothing in this report is marked passed unless it was executed. What was executed in this phase:

| Run | Result |
|---|---|
| Cloud suite (full, before the audit): `cd cloud/api && npx vitest run` | 98 files passed, 1 skipped by design; 807 tests passed |
| Root suite (full, before the audit): `npx vitest run` | 161 files, 1124 tests passed |
| **New audit probes**: `cloud/api/test/audit-probes.e2e.spec.ts` | 19 tests, all "green" as designed: 13 assert a required behaviour that IS met; 6 are `it.fails` probes whose required behaviour is NOT met (each re-run once as a plain test to capture the real assertion failure, below) |

No production code was changed. No EXE, APK, AAB or installer was created.

## 1. Architecture tested
Traced from code and read in full: activation and device registration, per-request device enforcement, the entitlement service, the order push/pull pipeline (locks, event claim, merge, sequence), entity sync, inventory ledger, number leases, realtime bus, device commands and fleet, KDS/KOT derivation on devices, the sync engine on devices, and the app wiring of POS, KDS, Captain, Kiosk, Kiosk Admin. The actual data flow per order source is in plan section 2.6.

## 2. Device combinations tested
Onboarding CASE 01-09 were executed through the Super Admin API (probe P-OK-5, nine cases): for each, a CORE-tier plan whose feature flags name the combination was assigned, the applications read back, and an activation key requested for POS, CAPTAIN, KDS and KIOSK. **All nine matched the expectation exactly** (entitled apps equal the expected set; keys for non-entitled types are refused). Multi-device: 2 POS + 2 KDS across 2 branches, plus one extra POS.

## 3. Onboarding scenarios
* CASE 01-09: **PASS-PROBE** (above).
* Kiosk through a second (KIOSK-family) subscription: PASS-EXISTING (`multi-family-subscriptions`). The Super Admin application list for that restaurant is wrong: see BUG-06.
* Onboarding wizard "enabledApps" path with the same combinations: not tested.

## 4. Data flow results
Documented from code (plan 2.6). Verified by execution: POS -> canonical order -> pull by another device (P-OK-2, P-OK-3); item merge; QR path (existing suite). Not verified end to end: a single order carried across POS -> Branch Core -> cloud -> KDS -> Captain -> Kiosk with every field compared (matrix OR-09).

## 5-9. POS, Kiosk, Captain, KDS, QR tests
* POS: order push, concurrency with other terminals, kitchen progress: PASS-PROBE (P-OK-3, P-OK-4); existing suite broad.
* Kiosk: pushes only (no order pull in the app). Kiosk to POS cloud path with a KIOSK-type device: not tested here.
* Captain: item merge with POS additions PASS-EXISTING; multiple Captain devices at once: GAP.
* KDS: branch isolation PASS-PROBE (P-OK-2); station assignment is client-side (FINDING KD-02); two KDS bumping: GAP.
* QR: PASS-EXISTING (78 specs across `qr-*`).

## 10-12. Multi-device, multi-branch, concurrency
* 3 terminals of different types pushing at once: PASS-PROBE (3 orders, 3 distinct sequence numbers).
* Branch A order reaches branch A KDS and not branch B KDS: PASS-PROBE.
* **Defects confirmed** for branch policy, quota concurrency, order status, tables (section 18).
* The spec's larger matrix (2 POS + 2 Kiosk + KDS ... 5 POS + 5 Kiosk + 2 KDS + 10 Captain, all sources at once) has **not been run**: no harness exists.

## 13-15. Offline, sync, failure recovery
Existing simulated tests cover outbox persistence, retry, cursors, chaos (duplicate, reordered, concurrent delivery), Branch Core discovery/fallback. Not run in this phase against a real device restart or a stopped Branch Core with each app. Suspected client-side defects (clock skew, eventId collision) are recorded as BY CODE and need probes.

## 16. Security / isolation
Restaurant isolation (RLS): PASS-EXISTING. Branch isolation of **orders**: holds for branch-bound devices (PASS-PROBE) and breaks for a branchless device (defect). Branch isolation of **tables/entities**: defect.

## 17. Load
Not run for device order traffic. Existing QR measurements only (`qr-scale`, development machine).

## 18. Failed tests (audit probes, confirmed defects)

Each record was produced by running the probe as a plain test against the current code.

**TEST ID: P-FAIL-2 (matrix ON-09)**
* EXPECTED: with a POS quota of 2, six simultaneous redemptions of six different keys create at most 2 active devices.
* ACTUAL: `expected 6 to be less than or equal to 2`; all six redeemed.
* ROOT CAUSE: `assertDeviceQuotaAvailable` counts active devices and the device is inserted afterwards with no serialisation. Only the single key claim is atomic.
* FILE/MODULE: `cloud/api/src/modules/activation-keys/activation-keys.service.ts` (`redeem`), `application-entitlements/application-entitlements.service.ts` (`assertDeviceQuotaAvailable`).
* SEVERITY: Critical (plan limit is the licensing control).
* RECOMMENDED FIX: take a per-restaurant advisory lock (`pg_advisory_xact_lock` on `device-quota:<restaurantId>:<appCode>`) at the start of the quota check inside the redeem transaction.

**TEST ID: P-FAIL-3 (DV-05)**
* EXPECTED: activation with no branch in a restaurant with two active branches is refused.
* ACTUAL: `expected 201 not to be 201`; the device was created with `branchId = null`.
* ROOT CAUSE: `branchId: key.branchId ?? onlyActiveBranchId(...)`, which returns `null` for more than one branch; key generation does not require a branch.
* FILE/MODULE: `activation-keys.service.ts` (`generate`, `redeem`), `tenant-auth.service.ts` (`onlyActiveBranchId`).
* SEVERITY: High.
* RECOMMENDED FIX: require `branchId` at key generation (and redeem) when the restaurant has more than one active branch; allow a restaurant-wide device only for console types by explicit choice.

**TEST ID: P-FAIL-4 (BR-04)**
* EXPECTED: a branchless device does not see another branch's orders.
* ACTUAL: `expected [ 'probe-brA-1', 'probe-conc-0', ... ] to not include 'probe-brA-1'`.
* ROOT CAUSE: `catchUp` applies no branch filter when `device.branchId` is null; and branch devices receive rows with `branchId IS NULL`.
* FILE/MODULE: `cloud/api/src/modules/order-sync/order-sync.service.ts` (`catchUp`).
* SEVERITY: High.
* RECOMMENDED FIX: with D2's branch policy in place, a branchless device is only a console with an explicit restaurant-wide grant; drop `OR branchId IS NULL` for branch devices.

**TEST ID: P-FAIL-1 (ST-02/03)**
* EXPECTED: an order that KDS marked READY stays READY when a stale PREPARING arrives (fresh eventId, older `updatedAt`).
* ACTUAL: `expected 'PREPARING' to be 'READY'`.
* ROOT CAUSE: order `status` is written from the last event unconditionally; only replays of the same eventId are ignored; item kitchen status is rank-guarded but the order header is not.
* FILE/MODULE: `order-sync.service.ts` (`pushEvents`, `data.status = evt.status`).
* SEVERITY: High.
* RECOMMENDED FIX: an order status transition table with per-device-type authority; forward-only unless an explicit correction event; reject with a recorded `SyncConflict`.

**TEST ID: P-FAIL-5 (BR-05)**
* EXPECTED: a Branch B device pulling `DINING_TABLE` does not receive a table created for Branch A.
* ACTUAL: `expected '{"entities":[...' not to contain 'A-9'`.
* ROOT CAUSE: entity sync is restaurant-scoped; `branchId` in a table payload is never used to filter.
* FILE/MODULE: `cloud/api/src/modules/entity-sync/entity-sync.service.ts` (`catchUp`).
* SEVERITY: High.
* RECOMMENDED FIX: branch-scope `DINING_TABLE` (and any later branch-owned type) in the pull; treat other types as restaurant-wide deliberately.

**TEST ID: P-FAIL-6 (ON-05)**
* EXPECTED: for a restaurant with a Restaurant-family and a Kiosk-family subscription, the admin application list shows POS and KIOSK enabled.
* ACTUAL: `expected [ 'KIOSK', 'KIOSK_ADMIN' ] to deeply equal ArrayContaining ["POS","KIOSK"]`.
* ROOT CAUSE: `listForRestaurant` reads only the newest active subscription's rows.
* FILE/MODULE: `application-entitlements.service.ts` (`listForRestaurant`, `withSource`).
* SEVERITY: Medium (display; enforcement itself is correct: `resolve` and `DeviceAuthGuard` consider all active subscriptions).
* RECOMMENDED FIX: merge rows across active subscriptions (enabled if any subscription enables it), and compute `source` with `appsForPlan` rather than the tier table.

## 19. Bugs found
| ID | Severity | Status | Summary |
|---|---|---|---|
| BUG-01 | Critical | confirmed | Device quota race (P-FAIL-2) |
| BUG-02 | High | confirmed | Branchless activation and cross-branch order visibility (P-FAIL-3/4) |
| BUG-03 | High | confirmed | Order status has no transition rules (P-FAIL-1) |
| BUG-04 | High | confirmed | Tables not branch-scoped (P-FAIL-5) |
| BUG-05 | High | by code, unexecuted | Device-submitted prices/totals are trusted; only QR is server-priced |
| BUG-06 | Medium | confirmed | Admin application list ignores all but the newest subscription (P-FAIL-6) |
| BUG-07 | High | by code, unexecuted | Client compares server time to device time when applying remote orders (`outbox.ts`) |
| BUG-08 | High | by code, unexecuted | Client eventId `orderId@updatedAt` can collide and drop a real change (`outbox.ts`) |
| BUG-09 | Medium | by code, unexecuted | Any device type may set any order status; header writes have no version precondition |
| BUG-10 | Medium | by code, unexecuted | QR orders are not deducted from inventory unless a recipe-owning device pulls them; two consoles may both deduct |
| BUG-11 | Medium | by code, unexecuted | `SyncedOrder.deviceId` is overwritten by each update (originating device lost) |
| BUG-12 | Low | by code | `Device.name` not unique; order/KOT ids use a millisecond timestamp plus 3-4 random characters |

"By code, unexecuted" means read in the source but not yet demonstrated by a test; these are hypotheses until probed.

## 20. Architectural weaknesses
1. **Two conflict models in one pipeline**: item-level merge with forward-only kitchen progress, next to last-writer-wins for the order header. The spec's status and totals rules fall in the second.
2. **Branch scope is enforced for orders and inventory only.** Entities, menu overrides and the branchless case are outside it.
3. **No stable device identity**, so re-registration is a policy question the code answers by default with "new device".
4. **KOT is not a shared entity.** It is derived per device; only QR KOTs are deterministic. Multi-KDS behaviour rests on item statuses and on a station name typed at the screen.
5. **Server trusts device-priced orders**; QR is the only server-priced channel.
6. **Clock dependence on the client** for applying server state.
7. **Per-restaurant sequence row** serialises all order writes of a restaurant (correct and gapless, but a throughput ceiling not yet measured).

## 21. Recommended fixes and execution order
See plan section 8. In short: quota race, branch policy, order status rules, client correctness (clock, eventId), entity branch scope and pricing decisions, admin entitlement view, then the ecosystem/multi-KDS/Branch-Core/load tests, then the low-severity items.

## 22. Remaining risks
* Roughly half of the matrix (concurrency combinations CC-02..08, multi-KDS, per-app Branch Core failure, restart in a real browser, end-to-end field consistency) is **unexecuted**.
* Several "by code" findings could turn out to be non-issues once probed; none is asserted as fact beyond its label.
* Decisions pending from you: branchless device policy; server-side pricing of device orders; branch overrides on POS/Kiosk/Captain; server-assigned KDS stations; device re-registration policy.


## 23. Fix phase results

Decisions taken and per-defect changes are in plan section 9. Evidence:

| Run | Result |
|---|---|
| `audit-probes` (19): the six former `it.fails` probes now assert the required behaviour as plain tests | 19 passed (quota, branch policy, order status, table isolation, admin list all fixed) |
| `order-rules.unit` | 7 passed |
| `onboarding-hardening.e2e` (order state, version precondition, price flags, origin device, two kitchens, re-binding, terminal names, floor plan by branch) | 10 passed |
| `ecosystem.e2e` (54 terminals + QR, 2 restaurants x 2 branches, simultaneous) | 1 passed: 160 orders, none lost or duplicated, gapless sequence, correct branch and source, KDS scoping exact |
| `multi_app_client_hardening` (root): clock skew, event ids, base version, inventory across consoles | 7 passed; 3 of the client tests **fail against the previous `outbox.ts`** (verified by restoring it), so they do test the fix |
| Existing suites | see the final line of this section |

Existing tests that encoded the old permissive behaviour were changed on purpose: `order-sync-and-suspension` (a branchless KDS is now refused; a console is restaurant-wide), `fleet-and-keys` and `device-updates` (terminals in multi-branch restaurants name their branch), `sync-reconciliation` (the trace test no longer pushes READY after COMPLETED). Two time-sensitive tests (`restaurant-sales`, the catch-up cursor test) were made deterministic: they depended on the database clock and this process agreeing to the millisecond and failed intermittently under load; the fixes did not cause that.

### Bugs now closed
BUG-01 to BUG-04 and BUG-06 to BUG-12 (BUG-05 by flagging, per decision). Migration added: `20260927030000_key_replaces_device`.

### Remaining risks
* Restart tests use in-process persistence, not a real browser or native shell restart.
* Device order load was measured once (160 orders in 784 ms, development machine); no sustained run.
* KDS station assignment remains client-side; branch overrides remain QR-only; four queries per device request remain.
* The status rules govern the current status vocabulary; a status word the server does not know is never blocked, so a new status must be added to `order-rules.ts` to be governed.
