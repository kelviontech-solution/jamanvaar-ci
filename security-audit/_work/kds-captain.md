# kds-captain audit

Revision: HEAD 9ddb5633c4679a295dfaa25a80a18dbc7912a82b (main). Read-only; no commands that mutate anything, no network, no servers started.

## Scope actually read (list of files/dirs, and what you did NOT cover)

Read in full:
- `apps/restaurant-system/kds/src/{App.tsx,main.tsx,cloud/cloudClient.ts}`, `kds/{index.html,vite.config.ts,package.json}`
- `apps/restaurant-system/captain/src/{App.tsx,main.tsx,cloud/cloudClient.ts,store/captainStore.ts}`, `captain/{index.html,vite.config.ts,package.json}`
- Captain components grepped for sinks / privileged actions (all `components/**`): no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `window.open`, `href={}`, `fetch`, direct repository calls, or discount/void/cancel/refund/settle UI. `CaptainTableWorkspaceModal.tsx`, `CaptainTransferMergeModal.tsx`, `CaptainLiveKotsView.tsx`, `CaptainJamanAiModal.tsx` skimmed for the action wiring (store calls only).

Read because the two apps execute them (shared code paths that decide the slice's security posture):
- `packages/database/src/pin.ts`; `repositories.ts` (StaffRepository 3130-3310, KOTRepository 2270-2505, LicenseRepository 1714-1847); `db.ts` (sync-server client 570-900, storage, default `license` 504-541); `local_core.ts`, `table_sync.ts`, `service_messages.ts`, `collection_sync.ts` (applyRemote), `captain_db.ts`, `kds_db.ts`
- `packages/sync/src/{outbox,entity_sync,device_gate,heartbeat,lan_mesh_sync,command_pipeline,floor_sync,menu_sync,app_update,offline_extension}.ts`
- `packages/business/src/{session_persistence,license_entitlements}.ts`, `packages/ui/src/{DeviceGateOverlay,PlatformNoticeBanner}.tsx`
- Server counterparts, only to decide what a KDS/Captain token can do: `cloud/api/src/modules/{order-sync,entity-sync}/**`, `common/guards/device-auth.guard.ts`, `prisma/schema.prisma` (SyncedOrder), `tooling/local-runtime/local_service.cjs` (auth gate, CORS, what it serves).

Facts established about the slice itself:
- KDS and Captain are plain Vite/React web apps. There is NO Tauri/Electron shell (`find apps/restaurant-system -name src-tauri` finds only pos and pos-admin), NO PWA manifest, NO service worker (`grep serviceWorker|workbox|manifest` empty), NO `_headers`/CSP file. `tooling/local-runtime` serves only /pos, /pos-admin, /kiosk, /kiosk-admin — Captain/KDS hosting is not in the repo.
- No UDP/discovery code, no `window.addEventListener('message')`, no WebSocket in these apps.

NOT covered: the rest of `cloud/api` (tenant-auth, activation-keys, throttling, CORS config), `packages/{ui,business,validation}` beyond the files above, `tooling/local-runtime` beyond the auth/CORS check, pos/pos-admin/kiosk apps, how Captain/KDS are actually hosted in production (headers, TLS). No runtime execution; all findings are code-trace unless stated.

## Inventory (endpoints / IPC commands / entry points in your slice)

Network targets. Cloud base = `import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000'` (build-time constant, `captain/cloudClient.ts:24`, `kds/cloudClient.ts:15`) — not attacker-selectable at runtime. Local sync base = `localStorage['jamanvaar_sync_server_url']` else `http://<page hostname>:5178` (`packages/database/src/db.ts:591-605`); setter reachable only from pos-admin (`PrintersDevicesModule.tsx:263`).

| Caller | Method + route | Auth sent | Notes |
|---|---|---|---|
| Captain `connectDevice` | POST `/api/v1/tenant-auth/login` (`credentials:'include'`) | none (email/password/deviceId/deviceToken in body) | first-run; `ACTIVATION_REQUIRED` -> step 2 |
| Captain `activateCaptainDevice` | POST `/api/v1/tenant-auth/activate-device` | activationSessionToken + Welcome Kit key in body | mints device token |
| KDS `activateKdsDevice` | POST `/api/v1/activation/redeem` | activation code in body | mints device token |
| both | POST/GET `/api/v1/orders/sync` | `Bearer <device token>` | server `DeviceAuthGuard` only; no device-type check; no branch filter on GET |
| both | POST/GET `/api/v1/entity-sync/:type` | `Bearer <device token>` | client uses STAFF_USER, SERVICE_MESSAGE (both); MENU_ITEM, MENU_CATEGORY, DINING_TABLE (Captain). Server accepts all 11 types from any device type |
| both | PATCH `/api/v1/devices/me/heartbeat` | `Bearer` | applies lock/update/notice/extension from the answer |
| Captain | JAMAN AI config/usage (`refreshAiConfigIfStale`, `reportAiQuery`) | `Bearer` | sends question intent text to cloud |
| both (via `db` singleton) | GET/POST `http://<host>:5178/api/sync`, EventSource `/api/events` | NONE | local service now 401s (key-gated); client never pairs so it disables itself after first 401 (`db.ts:571-587`) |

Local-only privileged actions (no server authority at all; enforced by nothing but the UI):
- Captain: seat table, add items/modifiers, send KOT (creates Order + KOT), transfer table, merge tables (cancels the secondary order), request bill, mark KOT/dish served, send messages. `CaptainProfile.permissions` (`captainStore.ts:66-78`) is a constant object that is never read anywhere. No discount/void/cancel/refund/settle exists in the Captain UI or store.
- KDS: START COOKING / MARK READY / MARK SERVED on tickets (`kds/App.tsx:336-379`), station filter (UI filter only).
- Both: PIN login = `StaffRepository.verifyPin` against locally stored `db.users[].pinHash` (`repositories.ts:3195`), UI gate only.

## Old-audit claim verification

| Old ID | Verdict | Evidence file:line | Note |
|---|---|---|---|
| F-042 Hardcoded demo PIN `1234` in Captain store | FIXED | `captainStore.ts:81-95` (`pin: ''`, profile built from real staff record), `:321-330` (login via `StaffRepository.verifyPin`), `packages/database/src/seed.ts:747` (`SEED_USERS = []`); removal in commit 5b1d4f0 (`git log -S"pin: '1234'"`) | No `1234`/`0000` literal remains in captain/kds src. Residual PIN weaknesses are new findings KDSCAP-02/03/05. |
| F-019 (client) Device token non-expiring, plaintext in `localStorage` | CONFIRMED (Medium -> Low in practice) | Store: `captain/cloudClient.ts:29,71-75,82`; `kds/cloudClient.ts:19,43-49,71`; re-read raw in heartbeat `captain:217`, `kds:137`. Server: `device-auth.guard.ts:22-26,58-63` (opaque token, hashed at rest, "never rotated automatically", no expiry check; revocation works via `device.status`) | Token theft needs local access (devtools/stolen tablet) — I found no XSS sink, so the old "XSS" vector is not reachable today. Server hashing + revoke are sound; no TTL/rotation/binding. See KDSCAP-01 for why a stolen token is worse than the old audit said. |
| F-032 LAN command pipeline trusts self-declared `senderRole` | FALSE for this slice (dead code + non-network transport) | `packages/sync/src/command_pipeline.ts` referenced only by `tests/unified_local_core_ecosystem.test.ts` (grep of apps/packages/tooling for `RestaurantCommandPipeline|executeCommand`); mesh transport is same-origin `BroadcastChannel` + `storage` event only (`lan_mesh_sync.ts:283-311`) | No app instantiates the pipeline and the "LAN mesh" never leaves the browser origin, so no remote peer can inject `senderRole:'ADMIN'`. Only HARDENING: delete the dead pipeline or sign it before anyone wires it up. Also note Captain (:5177) and KDS (:5179) are different origins, so the mesh does not even connect them. |
| F-027 (client) Local core `/api/sync` full-store SSE unauthenticated | FIXED server-side; client dormant; residual HARDENING | Server gate: `tooling/local-runtime/local_service.cjs:16-45,150-156` (Bearer/`x-service-key`/`?key=` required on `/api/sync`, `/api/events`, `/devices`, `/api/orders`); `.local_service_key` now gitignored and not tracked (`git ls-files` / `.gitignore:17`). Client: `db.ts:571-587,647,749,801,868` never sends a key, so it 401s and stops | Captain/KDS therefore do not use the local core at all today. Residual: KDSCAP-11 (client would apply unauthenticated `users`/`roles`/`license` from whatever answers). `Access-Control-Allow-Origin: *` remains (`local_service.cjs:139`) but is not the control. |
| F-029-analog (client picks host from spoofable beacon) | FALSE for this slice | No discovery code in captain/kds/packages ts (`grep discover_local_core|JAMANVAAR_CORE|dgram|UdpSocket` hits only kiosk-user/pos/pos-admin Tauri `main.rs`, packages/native). Target chosen by build constant (cloud) and `window.location.hostname` / localStorage override (local) | A LAN attacker cannot redirect these apps: they would have to control the page's own host/DNS or localStorage. KDSCAP-11 records the hardening item. |
| F-015 (client) Entity sync lets any device type pull customer PII | CONFIRMED (server unchanged); client does not request CUSTOMER | Server: `entity-sync.controller.ts:13-33` (`DeviceAuthGuard` only), `push-entity-sync.dto.ts:15` (11 types incl. CUSTOMER, STAFF_USER, PAYMENT_TRANSACTION), no `device.type` reference (grep). Contrast: payments/receipts controllers DO gate on device type (`payment-orders.controller.ts:18,32`, `receipts.controller.ts:17`, `menu-sync.controller.ts:19`). Client: only STAFF_USER/MENU_*/DINING_TABLE/SERVICE_MESSAGE are requested (`captain/App.tsx:142,147-149`; `kds/App.tsx:81`) but `pullEntitySync(entityType)` (`captain:203`, `kds:126`) takes any string | The gap is worse than "pull PII": the same missing check allows PUSH of STAFF_USER (KDSCAP-01). Order-sync has the same shape (KDSCAP-04). |
| F-031 Offline license/entitlement evaluated client-side | CONFIRMED (Low for Captain/KDS); partially FIXED | Client gate: `captain/App.tsx:192-226` -> `license_entitlements.ts:74-94` -> `db.license`, which defaults to PRO with `captainApp:true` valid to 2027 (`db.ts:504-541`) and is persisted in localStorage (`db.ts:1016,1301`); Captain has no path that receives a cloud entitlement. Lock/offline state: `device_gate.ts:58-80,265-272` (localStorage). FIXED part: emergency extensions are ECDSA-verified (`offline_extension.ts:33-62`, `device_gate.ts:181-198`) and bound to restaurant/branch/device. Server enforcement of per-app entitlement exists: `device-auth.guard.ts:95-104` | The Captain "PRO plan" screen is a cosmetic client check; a CORE restaurant's Captain UI works locally regardless. Cloud sync for a non-entitled device is still refused server-side (APP_DISABLED), so impact is licensing/revenue only. See KDSCAP-08. |

## New/independent findings

### KDSCAP-01 Any device token (Captain/KDS) can push STAFF_USER records: forge a manager PIN that every terminal then accepts
- Severity: high (CVSS 4.0 vector: `CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`); Class: CONFIRMED (code trace; not executed)
- CWE/OWASP: CWE-285 / CWE-862 Missing Authorization; OWASP API5 Broken Function Level Authorization
- Component + file:line(s): `cloud/api/src/modules/entity-sync/entity-sync.controller.ts:13-33` (only `DeviceAuthGuard`; `assertSyncableEntityType` is a whitelist of names, not of who may write them), `entity-sync.service.ts:14,66-95` (STAFF_USER not even last-change-wins; blind overwrite), `dto/push-entity-sync.dto.ts:15,19-22` (payload `z.record(string, unknown)`); consumer `packages/database/src/repositories.ts:3274-3296` (`applyRemoteUser` accepts remote `roleId`, `pinHash`, `isActive`, keyed by `id`, on every device); manager semantics `repositories.ts:3201` (`role-manager`/`role-super-admin` => `isManager`, used for POS manager override).
- Attacker / precondition: holder of any valid device token for the restaurant, e.g. the Captain or KDS token read from that tablet's `localStorage` (`jamanvaar_captain_device_token` / `jamanvaar_kds_device_token`), or a waiter/chef with devtools/remote-debug on the tablet. Token is long-lived (F-019) and never bound to a staff PIN.
- Repro (code-trace, dummy data): `POST /api/v1/entity-sync/STAFF_USER` with `Authorization: Bearer <captain token>` and body `{"events":[{"externalId":"x1","payload":{"id":"x1","username":"x","fullName":"X","roleId":"role-manager","isActive":true,"pinHash":"<hashPin('4321', restaurantId)>"}}]}`. `hashPin` is a public 20-line function (`pin.ts:19-25`) and `restaurantId` is on the device. Within one sync tick (15 s, `captain/App.tsx:162-166`, `kds/App.tsx:96-99`, `pos/App.tsx:153`) every POS/Admin/Kiosk/Captain/KDS pulls the record and `applyRemoteUser` writes it into `db.users`. Typing 4321 at POS then yields `verifyPin(...).isManager === true`. Using an existing manager's `id` instead silently replaces their PIN hash (until pos-admin's 15 s snapshot push overwrites it).
- Expected vs actual: expected a kitchen/floor device to be unable to create or alter staff identities (only POS_ADMIN should); actual: accepted and fanned out.
- Impact: vertical privilege escalation from floor/kitchen device to manager on POS (refunds, discounts, voids, cash movements) across all terminals of the restaurant, plus persistent backdoor account (server record survives; new ids are never overwritten by pos-admin).
- Root cause: entity-sync authorizes "some device of this restaurant" instead of "this device type may write this entity type". Same pattern also lets Captain/KDS write MENU_ITEM (price tampering, LAST_CHANGE_WINS keyed on client `updatedAt`), COUPON, INVENTORY_ITEM, PAYMENT_TRANSACTION, CUSTOMER, CUSTOMER_FEEDBACK.
- Recommended fix (smallest change at last trusted decision point): in `EntitySyncController.push`/`pull`, add a per-entity-type allowlist by `device.type` (e.g. STAFF_USER push: POS_ADMIN only; pull: POS, POS_ADMIN, KIOSK_ADMIN, and strip `pinHash` for anything else). Longer term: do not ship PIN hashes to devices that cannot verify; verify manager override server-side or with a signed staff credential.
- Suggested regression test: e2e in cloud/api: device of type CAPTAIN/KDS/KIOSK POSTs `/entity-sync/STAFF_USER` and `/entity-sync/PAYMENT_TRANSACTION` -> expect 403; POS_ADMIN -> 200; GET `/entity-sync/CUSTOMER` as KDS -> 403.

### KDSCAP-02 STAFF_USER pull distributes crackable PIN hashes of ALL staff (incl. managers) to every Captain/KDS device
- Severity: medium; Class: CONFIRMED
- CWE/OWASP: CWE-916 / CWE-522 (weak credential storage) + CWE-200
- Component + file:line(s): `repositories.ts:3268-3271` (`toSyncPayload` includes `pinHash`), `captain/App.tsx:141-143`, `kds/App.tsx:80-82` (pull all staff), `db.ts:1013,1292` (`users` persisted in localStorage under the app origin), `pin.ts:15-32` (two FNV-1a 32-bit rounds; the only inputs are a 4-digit PIN and the public `restaurantId`).
- Attacker / precondition: any Captain/KDS operator who can read localStorage/devtools (or a stolen tablet).
- Repro: read `jamanvaar_db_users` from the tablet; for each `pinHash` iterate 0000-9999 through `hashPin(pin, restaurantId)` (sub-millisecond total).
- Expected vs actual: floor/kitchen devices should hold no offline-crackable credential for higher roles; actual: full staff list with hashes, incl. `role-manager`/owner PINs, on every terminal. F-030 (weak hash) is CONFIRMED here in effect (`pin.ts` unchanged: still FNV-1a).
- Impact: manager PIN disclosure to lower-privileged staff => POS manager override.
- Root cause: PIN verification is done offline on every device against a globally replicated, fast, unsalted-per-user hash.
- Recommended fix: do not replicate hashes of roles above the device's own role; use a slow KDF (scrypt/Argon2id) with a per-user salt for anything that must be replicated, or verify PINs via an online/signed path for manager-level actions.
- Suggested regression test: unit test that `toSyncPayload`/the entity-sync pull for a KDS/CAPTAIN device never contains `pinHash` for `role-manager|role-super-admin`; property test that `verifyPinHash` cost is >= a set KDF budget.

### KDSCAP-03 "Removing" a staff member does not revoke their PIN on any other terminal
- Severity: medium; Class: CONFIRMED (code trace)
- CWE/OWASP: CWE-613 / CWE-672 (access not revoked); OWASP API2 Broken Authentication
- Component + file:line(s): `pos-admin/.../StaffRolesModule.tsx:96-115` (button says "deactivate and remove", calls `StaffRepository.deleteUser`), `repositories.ts:3247-3260` (local `splice`, no tombstone, no `isActive:false`), `pos-admin/src/App.tsx:463-464` (sync is a snapshot of the *remaining* users + upsert-only pull), `repositories.ts:3274-3296` (`applyRemoteUser` only creates/updates; never deletes), server `entity-sync.service.ts:14` (STAFF_USER is never deleted server-side).
- Attacker / precondition: a terminated employee who remembers their PIN and can reach any Captain/KDS/POS/Kiosk tablet that had already pulled their record.
- Repro: create staff in pos-admin (syncs to Captain/KDS), press Remove in pos-admin; on the Captain tablet the record is still in `db.users` with `isActive:true` and its `pinHash` still verifies (`captainStore.ts:323`). It even resurrects into pos-admin/new devices on a fresh pull from epoch (`entity_sync.ts:78`), since the cloud row persists.
- Expected vs actual: removal must revoke everywhere; actual: only the admin device forgets. Only the separate "edit -> inactive" path (`StaffModal.tsx:99` `updateUser`) propagates, because `isActive` is in the synced payload.
- Impact: ex-employee retains PIN access (including manager-role PINs) on all previously synced terminals indefinitely.
- Root cause: delete is local-only; sync has no delete/tombstone semantics for STAFF_USER (contrast DINING_TABLE/collections which have tombstones, `table_sync.ts:129-136`).
- Recommended fix: make Remove = set `isActive:false` (and keep the row) so it syncs; or push a `{deleted:true}` tombstone and honor it in `applyRemoteUser`.
- Suggested regression test: after `deleteUser` + one sync tick pair, `StaffRepository.verifyPin(oldPin)` on a second device instance returns null.

### KDSCAP-04 Order sync: no device-type/branch/version authority; whole-order last-writer-wins lets stale Captain/KDS state revert a settled order (and any device tamper with any order)
- Severity: medium; Class: CONFIRMED (code trace) for logic flaw and cross-branch pull; race outcome not executed
- CWE/OWASP: CWE-285, CWE-362, CWE-639 (BOLA); OWASP API1/API5
- Component + file:line(s):
  - Server: `order-sync.controller.ts:11-29` (comment: "open to every terminal type"), `order-sync.service.ts:55-93` (upsert by `(restaurantId, externalOrderId)`; no device-type check; `evt.updatedAt` is validated but never stored or compared; no branch check on the existing row; `branchId` only set on create), `order-sync.service.ts:130-136` (`catchUp` filters only `updatedAt > since`, no `branchId`), `dto/push-order-sync.dto.ts` (status/paymentStatus/totals free strings/ints "trusted as-is").
  - Client: `packages/database/src/repositories.ts:2387-2397,2489` (a KDS/Captain status tap marks the whole Order `SAVED_LOCALLY`), `packages/sync/src/outbox.ts:123-172,425-449` (pushes the device's full copy incl. `status`, `paymentStatus`, totals), `outbox.ts:198-221,507-513` (pull applies `remote.status/paymentStatus/total*` unconditionally when `remote.updatedAt` — the SERVER write time — is newer), `outbox.ts:371-377` (on reconnect it pushes BEFORE pulling).
- Attacker / precondition: (a) no attacker needed for the integrity bug: normal offline/latency; (b) an attacker with any device token for tampering/cross-branch read.
- Repro (trace): POS settles order O at t1 (cloud: COMPLETED/SUCCESS). A Captain/KDS that was offline or up to 3-4 s behind (poll intervals `kds/App.tsx:90`, `captain/App.tsx:152`) taps READY/SERVED on O, pushing its stale `status=READY, paymentStatus=PENDING`. Server overwrites and stamps a newer `updatedAt`. POS's next pull applies it (`outbox.ts:509`, `applyPaymentAndTotals`), re-opening a paid order and skewing `BusinessDayRepository.recalculateMetrics`. For tampering: a Captain token can POST an existing `externalOrderId` with `paymentStatus:'SUCCESS'`, `totalAmount:0`, `status:'COMPLETED'`; for cross-branch: a branch-B KDS/Captain `GET /orders/sync` returns branch-A orders incl. `meta.customerName/customerPhone`, and `ensureKotsForOrder` (`outbox.ts:308-351`) prints branch-A tickets on the branch-B kitchen screen.
- Expected vs actual: kitchen/floor devices may only advance item/ticket status (monotonic, on their branch's orders); actual: they overwrite money and payment fields of any order in the tenant, and receive every branch's orders. This confirms old F-043 still open at HEAD (`order-sync.service.ts:130-136` unchanged; BUG-048 only tags creation).
- Impact: payment-state regression/reporting drift, fraud by a compromised floor token, cross-branch data leakage (customer name+phone) and cross-branch kitchen tickets.
- Root cause: order mirror was designed as "operational, not authoritative" (`push-order-sync.dto.ts` header) but is treated as authoritative by POS; no field-level ownership, no compare-and-set on `updatedAt/syncVersion`, no device-type or branch scoping.
- Recommended fix (smallest): server-side, (1) reject a push whose `evt.updatedAt` < stored row time or add `syncVersion` CAS; (2) for `device.type in (KDS, CAPTAIN)` accept only item `kitchenStatus`/ticket-status fields and ignore `paymentStatus/discount/total*/status=COMPLETED|CANCELLED|REFUNDED`; (3) add `branchId: device.branchId` to `catchUp` and to the push lookup. Client: pull before push on reconnect.
- Suggested regression test: cloud e2e: KDS device pushes `paymentStatus:'SUCCESS'` -> ignored/403; stale push (older `updatedAt`) -> no state change; device of branch B GET returns zero branch-A rows.

### KDSCAP-05 PIN entry has no throttle/lockout and failures are not audited (Captain, KDS)
- Severity: low (medium if the tablet is publicly reachable); Class: CONFIRMED
- CWE/OWASP: CWE-307
- Component + file:line(s): `captainStore.ts:321-355` (failure path only sets `loginError`; only success is logged), `captain/App.tsx:231-235,493-503,525` (keypad auto-submits at 4 digits, clears, no delay), `kds/App.tsx:243-273` (same, no audit at all), `repositories.ts:3195-3203` (no attempt counter; `pinHash` unique per restaurant by construction, `generateUniquePin`, so one guess hits SOME account: with N staff the expected work is about 10000/N attempts).
- Attacker / precondition: anyone with hands on a tablet at the PIN screen (guest, ex-employee).
- Repro: enter PINs sequentially; no back-off. (Also note: reading `db.users` from devtools skips even that; see KDSCAP-02.)
- Impact: unauthorized Captain/KDS session; on Captain that is table/order view and KOT firing, on KDS ticket state changes. Because Captain forces `role:'CAPTAIN'`, a manager PIN hit does not elevate inside Captain itself.
- Root cause: purely local, unmetered check; PIN is a UI gate, not a boundary.
- Recommended fix: exponential back-off after 3-5 failures with a persisted counter, log `LOGIN_FAILED` to AuditRepository; longer PINs for manager roles.
- Suggested regression test: after 5 wrong PINs `login()` refuses even a correct PIN for the cool-down; audit log contains the failures.

### KDSCAP-06 Session restore does not re-validate the user on KDS; Captain restore ignores role/terminal changes; 24 h sessions with no idle lock
- Severity: low; Class: CONFIRMED
- CWE/OWASP: CWE-613 / CWE-287
- Component + file:line(s): KDS `kds/App.tsx:107-109` (`isKdsLoggedIn = SessionPersistence.load('kds') !== null` — no lookup of `userId`, no `isActive`, no role check); Captain `captainStore.ts:257-262` (checks only that the user exists and `isActive !== false`, not `canUseTerminal` — demotion to a role that may not use Captain is ignored; profile role hard-coded `CAPTAIN`, `:87`); `session_persistence.ts:47,64-77,99-110` (24 h TTL, `lastActiveAt` never consumed, `touch()` has no callers, token is `Math.random`, and is never verified against anything).
- Attacker / precondition: KDS/Captain left unattended, or someone able to write localStorage (devtools): a forged `jamanvaar:session:kds:v1` JSON skips the PIN screen on KDS with any `userId`.
- Impact: stale/forged sessions; combined with KDSCAP-03 a removed employee's session stays valid until TTL. Low because the PIN itself is only a UI gate (device token is the real credential).
- Recommended fix: on restore re-run `db.users.find(active)` + `canUseTerminal` for both apps; enforce inactivity lock using `lastActiveAt`; sign the session or drop it.
- Suggested regression test: deactivate/remove user, reload Captain/KDS -> back at PIN screen; change role to cashier -> Captain restore refuses.

### KDSCAP-07 Captain has no enforced authorization model (permissions are dead constants); custom roles allowed everywhere
- Severity: low; Class: HARDENING (no server boundary is violated by the UI as shipped)
- CWE/OWASP: CWE-863 / CWE-602 (client-side enforcement)
- Component + file:line(s): `captainStore.ts:66-78` (`CAN_APPLY_DISCOUNT:false`, `CAN_VOID_ITEM:false`, etc.; grep shows no reader of these flags anywhere), `:507-516,558-605` (transfer/merge of ANY table, merge cancels the secondary order locally), `repositories.ts:3209-3220` (`canUseTerminal` returns `true` for any role id not in the 5-entry map: "custom role is never locked out").
- Attacker / precondition: any Captain-PIN holder; any custom-role PIN holder (e.g. a "Trainee" role) can open Captain, POS, KDS.
- Impact: what a captain can do (create/modify orders, transfer/merge/close tables, mark dishes served, request bill) is limited only by which buttons exist; because sync is not authorization-checked (KDSCAP-04) nothing server-side backs it either. Discounts/void/cancel/refund/settlement are not present in the Captain UI, so none of those can be triggered through it (but see KDSCAP-04 for direct API abuse).
- Recommended fix: make custom roles default-deny for terminals until explicitly granted; enforce transfer/merge/serve by role on the server-side mirror.
- Suggested regression test: `canUseTerminal('role-custom-x','CAPTAIN')` false unless granted.

### KDSCAP-08 Captain plan/entitlement gate is a local default (PRO, captainApp:true) — cosmetic
- Severity: low; Class: CONFIRMED (re-verifies F-031 for this slice)
- CWE/OWASP: CWE-602
- Component + file:line(s): `captain/App.tsx:192-226`, `license_entitlements.ts:74-94`, `db.ts:504-541` (default license), `db.ts:1301-1302` (localStorage license overrides default and is user-editable), `device_gate.ts:265-272` (offline lock from `lastCheckInAt` in localStorage).
- Impact: none server-side (cloud APP_DISABLED still applies, `device-auth.guard.ts:95-104`), but a CORE-plan restaurant gets the paid Captain UI for local use and offline lock can be reset by clearing `jamanvaar_device_gate_v1`.
- Fix: acceptable to leave as UX; do not treat as a control. If revenue matters, pull entitlement via signed certificate (`applyLicenseCertificate`) in Captain too.

### KDSCAP-09 `PlatformNoticeBanner` renders cloud-supplied `downloadUrl` as an `href` with no scheme allow-list
- Severity: low; Class: HARDENING (needs a malicious/compromised platform user)
- CWE/OWASP: CWE-79 (javascript: URL), CWE-601
- Component + file:line(s): `packages/ui/src/PlatformNoticeBanner.tsx:36-38` (`<a href={update.downloadUrl}>`; React 18.3 does not block `javascript:`), fed from heartbeat `AppUpdate.apply` (`app_update.ts:61-63`, `heartbeat.ts:45`), server accepts any string: `cloud/api/src/modules/applications/dto/application.dto.ts:10` (`downloadUrl: z.string().optional()`). Contrast `DeviceGateOverlay.tsx:75-77` which does apply an `https?://` guard.
- Attacker / precondition: platform user allowed to publish app releases sets `javascript:...`; operator taps "Download" on the optional-update bar in Captain (mounted at `captain/main.tsx:11`; KDS `main.tsx` mounts the same).
- Impact: script runs in the terminal origin => reads device token + staff hashes from localStorage. Fleet-wide, but gated on a privileged actor plus a tap.
- Fix: validate `downloadUrl` is `https:` on the server DTO and in the banner.
- Test: DTO rejects `javascript:`/`data:`; banner does not render a link for non-https.

### KDSCAP-10 No Content-Security-Policy, third-party font CDN, no transport check on API base
- Severity: info; Class: HARDENING
- CWE/OWASP: CWE-1021 / CWE-319
- Component + file:line(s): `captain/index.html:7-13`, `kds/index.html:7-13` (no CSP meta; Google Fonts stylesheet with no SRI), `captain/cloudClient.ts:24`, `kds/cloudClient.ts:15` (default `http://localhost:4000`; nothing prevents a production build with an `http://` base, which would send the Bearer device token in cleartext), no HTTP headers/config for these two apps anywhere in the repo (hosting unknown).
- Impact: defence-in-depth only; no XSS sink exists today (React text nodes only, no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in captain, kds, packages/ui, packages/sync).
- Fix: strict CSP (`default-src 'self'; connect-src <api>`), self-host fonts, assert `https:` (except loopback) for API_BASE at startup.

### KDSCAP-11 `db` sync-server client applies unauthenticated `users`/`roles`/`license` from whatever answers at `<page-host>:5178`
- Severity: low/info; Class: HARDENING (dormant while local core 401s the unpaired client)
- CWE/OWASP: CWE-345 / CWE-494
- Component + file:line(s): `db.ts:591-605` (URL from `localStorage['jamanvaar_sync_server_url']` or `http://${location.hostname}:5178`), `:647-671,749-785,801-835,868-895` (merges `users`, `roles`, `license`, `orders`, `kots` from response/SSE with no auth, signature or type checks), `:571-587` (401 => switches itself off).
- Attacker / precondition: something other than the real local service answers at that address without requiring auth (rogue process binding :5178 on the same host when the real one is down; DNS/hostname spoof of the page host; localStorage write). A LAN peer alone cannot redirect it.
- Impact: injecting a staff record with a known PIN hash and `role-manager`, or a PRO license blob.
- Fix: pin the sync origin, require the pairing Bearer, ignore `users/roles/license` from this channel (identity data should only come via authenticated entity-sync).

### KDSCAP-12 Data minimisation and attribution gaps on KDS/Captain
- Severity: low; Class: HARDENING
- Component + file:line(s): PII: `outbox.ts:150-169,254-291` and `order-sync` meta carry `customerName/customerPhone` to every device; KDS UI does not render them (`kds/App.tsx:664-830`) but they are persisted in the KDS/Captain `orders` localStorage (`db.ts:992`). Attribution: `kds/App.tsx:347-352` writes every ticket action with the hard-coded `username:'Head Chef'` (the signed-in `userId` is in the session but unused); all Captain tablets identify as `CAPTAIN-01` (`captainStore.ts:337,1158`), all KDS as `KDS-01` (`kds/App.tsx:136`); client-supplied `captainName`, `senderName` are accepted by the cloud unbound to the device (`push-order-sync.dto.ts`, `service_messages.ts:99`), so a device can impersonate "Manager" in messages (`captainStore.ts:1015-1047`).
- Impact: over-collection of guest PII on kitchen screens; audit trail cannot say who marked a ticket ready or which tablet fired a KOT.
- Fix: strip customer fields for KDS/CAPTAIN in the order mirror; log the real staff user and real device id.

### KDSCAP-13 Order catch-up truncates at 500 rows but the client advances its cursor to "now"
- Severity: low (availability/integrity of kitchen tickets); Class: CONFIRMED (code trace)
- CWE/OWASP: CWE-841 / CWE-770
- Component + file:line(s): `order-sync.service.ts:120-137` (`take: 500`, `orderBy updatedAt asc`), `outbox.ts:504,534` (`safeSet(CATCH_UP_CURSOR_KEY, serverTime)` irrespective of page fullness; contrast entity sync which handles a full page, `entity_sync.ts:83-87`).
- Precondition: more than 500 orders changed since the cursor (new device on a busy or multi-branch tenant [no branch filter, KDSCAP-04], or a long-offline device).
- Impact: the newest orders — the ones a kitchen needs — are silently never delivered to a freshly activated KDS/Captain.
- Fix: mirror the entity-sync pagination (advance cursor to last row's `updatedAt` when the page is full).

## Controls verified OK (things you checked that are sound; one line each with file:line)
- No hardcoded PIN/password in captain/kds src; `SEED_USERS = []` (`seed.ts:747`); Captain profile has `pin:''` (`captainStore.ts:87`).
- PINs are not stored in plaintext or in the persisted session (`session_persistence.ts:2-6,64-77`; `repositories.ts:3146-3156`); PIN generation is unique-per-restaurant and avoids weak PINs first (`pin.ts:52-70`).
- Device token is opaque and stored hashed server-side; revoked/locked/suspended/subscription/app-disabled/branch-inactive devices are refused per request (`device-auth.guard.ts:58-116`) and the client turns those codes into a lock overlay (`device_gate.ts:206-221`, `DeviceGateOverlay.tsx`).
- Emergency offline extension is ECDSA P-256 verified against built-in keys and scoped to restaurant/branch/device (`offline_extension.ts:33-62`, `device_gate.ts:181-198`).
- Activation step 2 in Captain uses a server-issued `activationSessionToken` held only in React state, not persisted (`captain/App.tsx:79-80,113`); passwords are never stored.
- XSS: no `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`document.write`/`window.open` and no `href` built from data in captain, kds, packages/ui except KDSCAP-09; all displayed order/menu/message text goes through React text nodes (`kds/App.tsx:730-773`, captain components).
- Cross-app "mesh" is same-origin BroadcastChannel/`storage` only; no `postMessage` listeners, no WebSocket, no network-reachable command surface in these apps (`lan_mesh_sync.ts:283-311`).
- Local core service now requires a key on data endpoints and gates pairing behind a console-only PIN (`local_service.cjs:16-45,150-156,229-240`); key file is gitignored and not tracked.
- Remote table records are type-validated before use (`table_sync.ts:166-236`), service messages are parsed and age/recipient filtered (`service_messages.ts:89-105,138-146`), staff records require string `id`+`pinHash` (`repositories.ts:3274-3277`).
- Ticket status merges on the client only move forward via reconcile (`repositories.ts:2404-2442`, `KOT_STATUS_RANK`), so an older order copy cannot un-cook a ticket (the order-level status is the weak spot: KDSCAP-04).
- Payments/receipts endpoints DO enforce device type (`payment-orders.controller.ts:18,32`, `receipts.controller.ts:17`) — evidence the pattern is known and only missing on sync.

## Not verified / limits
- No runtime test was executed (no server started); KDSCAP-01/03/04 are code-trace with the cited server and client paths. Recommend a loopback e2e (dummy restaurant, two device tokens) before triage closes them.
- Production hosting of Captain/KDS (TLS, headers, CSP, service worker injection by a host, whether tablets expose devtools/remote debugging or are kiosk-locked) is not in the repo: UNVERIFIABLE, and it decides how easy device-token extraction is (KDSCAP-01/02 preconditions).
- Cloud-side items I only touched to bound the client impact (activation redeem brute-force/throttling, tenant-auth login cookies + CORS with `credentials:'include'`, DTO limits, DB RLS branch scoping) belong to the cloud slice.
- `packages/business` AI modules (JAMAN AI) not reviewed beyond noting the Captain sends the question intent string to the cloud.
- `RestaurantIdentityRepository.adopt/startFreshOperations` behaviour on re-activation (data wipe/merge across restaurants on a reused tablet) not analysed.
