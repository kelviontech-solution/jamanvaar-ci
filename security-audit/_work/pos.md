# pos audit

Revision reviewed: `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (main). Read-only; no code executed except greps. Money/JS/Rust findings are code-traces unless stated.

## Scope actually read (list of files/dirs, and what you did NOT cover)

Read in full or security-relevant parts:
- `apps/restaurant-system/pos/src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock (versions),build.rs,src/main.rs,gen/schemas/capabilities.json,binaries/ (metadata only),target/ (tracked-file inventory only)}`; there is NO `capabilities/` dir, NO updater plugin/config, NO deep-link plugin.
- `packages/native/printing.rs` (all).
- POS frontend: `src/App.tsx`, `src/main.tsx`, `src/store/posStore.ts` (all), `src/cloud/cloudClient.ts`, `src/services/{printerService,recoveryService,csvExportService}.ts`, `components/auth/PosLogin.tsx`, `components/common/ManagerOverrideModal.tsx`, `components/payment/PosPaymentModal.tsx` (settle logic), `components/cart/{PosCart,PosDiscountModal}.tsx` (discount paths), `components/bills/PosBillsView.tsx` (refund/reopen), `components/orders/PosOrdersView.tsx` (void/refund), `components/shift/{PosShiftAndCashView,PosCashDrawerModal}.tsx`, `components/settings/PosSettingsView.tsx` (license section), `components/days/PosCloseDayModal.tsx` (close-day call), `components/menu/PosMenuManagerModal.tsx` (mutation calls, href sinks), grep sweep of all 53 POS src files for XSS/IPC/storage sinks.
- Shared code the POS depends on (only the parts on the POS trust path): `packages/database/src/{pin.ts,db.ts (license, sync overwrite, storage),repositories.ts (Order/Shift/Staff/ManagerOverride/License repos),local_core.ts}`, `packages/business/src/{pricing.ts,session_persistence.ts,license_certificate.ts,license_entitlements.ts}`, `packages/sync/src/{device_gate.ts,offline_extension.ts,heartbeat.ts,app_update.ts,outbox.ts,entity_sync.ts,lan_mesh_sync.ts (first 200 lines)}`, `packages/api/src/{print_transport.ts,payment.ts}`, `packages/ui/src/{ThermalReceiptView.tsx (print HTML),DeviceGateOverlay.tsx,PlatformNoticeBanner.tsx}`, `packages/config/src/license_keys.ts` (public keys only).
- Cross-slice code read only to confirm reachability of POS findings: `cloud/api` `entity-sync/*`, `order-sync/*`, `payments/{payment-orders.controller,payments.service}`, `common/guards/device-auth.guard.ts`, `tooling/local-runtime/local_service.cjs` (auth gate lines), `apps/restaurant-system/captain/src/store/captainStore.ts` (F-042).

NOT covered: Vite/Tailwind build pipeline internals, `tooling/installers/*` (other slice), the 92 MB prebuilt sidecar exe contents (only sized/tracked check; no reverse engineering), `dist/` bundle beyond greps, most of `PosSettingsView`/`PosInventoryView`/`PosReportsView`/`PosDayHistoryView` presentation code, `lan_mesh_sync.ts` beyond line 200, `command_pipeline.ts` (F-032 is not in my list), i18n. No runtime testing (no Tauri build, no WebView2 behaviour testing).

## Inventory (endpoints / IPC commands / entry points in your slice)

Tauri IPC commands (`src-tauri/src/main.rs`, registered at :123). There is no `capabilities/*` and `capabilities.json` is `{}`; `build.rs` has no `AppManifest`. In Tauri v2 that means app-defined commands are not ACL-gated (any script in the main webview may call them) and all plugin/core commands (incl. the registered `tauri-plugin-shell`) are denied by ACL.

| Command | Args | Auth | Validation | Notes |
|---|---|---|---|---|
| `get_local_core_info` (:45) | none | none | n/a | returns LAN IP, hardcoded port 5178 |
| `get_machine_ip` (:57) | none | none | n/a | LAN IP disclosure |
| `send_escpos_bytes` (:65) | `ip:String, port:u16, bytes:Vec<u8>` | none | only `"{ip}:{port}".parse::<SocketAddr>()` (IP literal, any range incl. loopback/public/link-local, any port 1-65535), no size cap | sync fn (blocks main thread up to 5 s connect); error text distinguishes refused/timeout => port-scan oracle |
| `list_system_printers` (:89) | none | none | fixed PowerShell script | spawns powershell |
| `scan_network_printers` (:95) | `subnet: Option<String>` | none | `subnet_prefix()` requires RFC1918 (`printing.rs:79`); port fixed 9100, 300 ms, 254 threads | ok |
| `print_raw_system` (:107) | `name, bytes` | none | `is_safe_printer_name` (`printing.rs:89`) blocks shell metachars but allows `\` (UNC), no check against installed printers | name passed via env var not script text (good) |
| `print_serial` (:113) | `port, baud, bytes` | none | `normalize_com_port` COM1-256, baud allow-list (`printing.rs:97,285`) | `cmd /C mode` args separate (good) |
| sidecar `JamanvaarLocalCore` (:138) | spawned at startup via shell plugin, no args | n/a | n/a | committed prebuilt exe (`binaries/`), listens on 5178 |
| UDP beacon (:21-31) | broadcasts `JAMANVAAR_CORE|ip|5178` every 3 s to 255.255.255.255:45678 | none | n/a | unauthenticated LAN announcement (kiosk side is F-029, other slice) |

Tauri config: `app.security.csp: null` (tauri.conf.json:26); no `devtools` cargo feature (Cargo.toml: `tauri = { features = [] }`) so devtools are off in release; NSIS `installMode: currentUser`, no signing keys/thumbprint; `externalBin` sidecar; no updater/deep-link; single window loading local `../dist`.

Frontend network entry points (`src/cloud/cloudClient.ts`, all `deviceFetch` = `Authorization: Bearer <device token>` with token in localStorage): `POST /api/v1/activation/redeem` (unauthenticated, activation code), `GET /api/v1/payments/:id/status`, `POST /api/v1/payments/:id/refund`, `POST|GET /api/v1/orders/sync`, `POST|GET /api/v1/entity-sync/:type`, `PATCH /api/v1/devices/me/heartbeat`, `POST /api/v1/receipts/send`, AI usage report. Also unauthenticated LAN calls to `http://<window.location.hostname>:5178/api/{sync,orders,events}` from `packages/database` (`db.ts`, `repositories.ts:451`).

Authorization model actually present in the POS: (1) device token to cloud (server-checked: device/restaurant/subscription/app entitlement in `DeviceAuthGuard`; no staff identity, no branch/role concept server-side for sync/refund), (2) local 4-digit PIN -> `db.users` (localStorage) -> role, (3) `canUseTerminal` (which roles may open POS), (4) manager-PIN prompt on 5 UI actions: high discount, refund, void, reopen bill, KOT cancel. No other role gating exists on any tab.

## Old-audit claim verification

| Old ID | Verdict | Evidence file:line | Note |
|---|---|---|---|
| F-028 | CONFIRMED (weakness), severity overstated | `main.rs:65-81`, `tauri.conf.json:26` (`csp: null`), no capabilities dir, `capabilities.json` = `{}` | `send_escpos_bytes` still connects to any IP literal/port (no private-range/9100 allow-list, unlike `scan_network_printers`). CSP is still null. BUT: no script-execution sink found in POS itself (no `dangerouslySetInnerHTML/innerHTML/eval/document.write` in `apps/restaurant-system/pos/src` or in POS-used `packages/*`), so exploitation needs an XSS primitive or poisoned printer data. Rated medium/hardening, not High. See POS-08. |
| F-030 | CONFIRMED | `packages/database/src/pin.ts:15-32` (2x FNV-1a 32-bit, salt = public restaurantId), `repositories.ts:3195-3202` | Unchanged. Worse than claimed: hashes are also synced to cloud and pulled by every device (`repositories.ts:3268-3271`, `App.tsx:152-153`), see POS-01/POS-02. |
| F-031 | CONFIRMED (low in POS) | `packages/sync/src/device_gate.ts:58,59,265-272` (state in localStorage, `Date.now()`), `repositories.ts:1733-1756` (`setVerifiedLicense` ignores `payload.expiresAt`), `db.ts:504-540` (default PRO license), `PosSettingsView.tsx:194` | Offline lock / entitlements are client-evaluated: edit `jamanvaar_device_gate_v1`, roll clock back, or edit `license` in storage. The POS itself gates no feature on `entitlements` (no `isFeatureEnabled` call in POS), so the practical impact in POS is nil; the server does enforce device/subscription state per request (`device-auth.guard.ts`). Additional defects in POS-12. Needs local storage access (no devtools in release) => low. |
| F-042 | FIXED | Old: `git show d89777c:.../captainStore.ts:62-66` had `DEFAULT_CAPTAIN` with `pin:'1234'`; HEAD `captainStore.ts:71-83` builds profile from a real user with `pin: ''`; commit `5b1d4f0`; `packages/database/src/seed.ts:747` `SEED_USERS = []` | No hardcoded PIN remains in captain or seed. |
| F-008 (POS side) | CONFIRMED (code path), exploit gated | `packages/database/src/db.ts:669-670, 781-784, 802-803` (users/roles/license replaced from sync JSON), POST of whole DB at `db.ts:704-745`; `local_service.cjs:40,154` requires Bearer; POS never pairs (`db.ts:571-575` comment) | POS blindly replaces `users`, `roles`, `license` from `GET http://<host>:5178/api/sync` with no signature and sends no token. Today the bundled local core answers 401 so the loop is inert (`serverSyncUnauthorized`), i.e. the reachable attacker is another process able to answer on 127.0.0.1:5178 (Tauri host is `tauri.localhost`) or a modified `jamanvaar_sync_server_url`. Also leaks the whole DB (incl. pinHashes) via unauthenticated POST to that URL. Medium-low; see POS-16. The stronger, actually reachable version of the same defect is the cloud STAFF_USER pull (POS-01). |
| F-019 (client) | CONFIRMED | `cloudClient.ts:14-18,77-84` (plaintext localStorage `jamanvaar_pos_device_token`), `device-auth.guard.ts:24-27` (long-lived, never rotated, hash-compared server side) | Client stores the bearer in WebView2 localStorage (readable by any process as the same Windows user, backups, profile copy). No rotation/expiry client or server. Also default `API_BASE` is `http://localhost:4000` and no build script/CI sets `VITE_CLOUD_API_BASE_URL` (grep of `tooling/`, `.github/`); the checked-in `dist/` bundle embeds `localhost:4000`. See POS-13. |
| F-016 (client) | CONFIRMED (both halves) | Client: `PosBillsView.tsx:307-330`, `cloudClient.ts:114-125`; server: `payment-orders.controller.ts:29-36`, `payments.service.ts:124-167` | Manager PIN is verified only locally (`ManagerOverrideModal.tsx:36-52`) and no proof of it is sent; server accepts any POS/POS_ADMIN device token, no staff identity. Over-refund guard exists (aggregate of SUCCESS+PENDING refunds, `payments.service.ts:135-147`) but check and insert are separate transactions with no lock (race). Also the client only calls it for `paymentMethod === 'UPI'` (`PosBillsView.tsx:317`) while POS records UPI as `UPI_QR` (`PosPaymentModal.tsx:~381`), so POS UPI refunds never reach the gateway (POS-06d). |

## New/independent findings

### POS-01 Any device token can mint or overwrite POS staff (role + PIN) via STAFF_USER sync; all staff PIN hashes readable by any device
- Severity: high (CVSS 4.0 suggested `AV:N/AC:L/AT:N/PR:L/UI:N/VC:L/VI:H/VA:N/SC:N/SI:N/SA:N`); Class: CONFIRMED (code trace, cross-slice cloud + POS)
- CWE/OWASP: CWE-639 / CWE-269 / CWE-345; OWASP A01 Broken Access Control, A08 Data Integrity
- Component + file:line(s): POS `apps/restaurant-system/pos/src/App.tsx:152-153,165-170` (`syncStaff` every 15 s -> `EntitySyncEngine.catchUp('STAFF_USER', remote => StaffRepository.applyRemoteUser(remote.payload))`); `packages/database/src/repositories.ts:3274-3298` (`applyRemoteUser`: accepts `roleId`, `isActive`, `pinHash` verbatim, upserts by id, no role/branch/signature/updatedAt check); cloud `cloud/api/src/modules/entity-sync/entity-sync.controller.ts:19-36` (only `DeviceAuthGuard`; no device-type restriction; `STAFF_USER` in `SYNCABLE_ENTITY_TYPES`), `entity-sync.service.ts:68-88` (last writer wins for STAFF_USER, payload untyped `dto/push-entity-sync.dto.ts:22-24`), `catchUp` returns full payload incl. `pinHash` to every device.
- Attacker / precondition: holder of ANY device token of the same restaurant, e.g. a rogue waiter with a Captain tablet/PWA, a KDS or a public self-order kiosk (token is in localStorage, F-019). Lower trust than a POS manager.
- Repro (safe, local, dummy data): with a dummy restaurant `R`, compute `hashPin('4321', R)` (formula in `pin.ts:25-31`), `POST /api/v1/entity-sync/STAFF_USER` with a captain/kiosk device token and body `{events:[{externalId:'usr-x',payload:{id:'usr-x',username:'x',fullName:'X',roleId:'role-manager',isActive:true,pinHash:'<hash>'}}]}`; within 15 s POS `syncStaff` writes it into `db.users`; enter 4321 on POS login or on the manager-override pad.
- Expected vs actual: staff/roles/PIN hashes should be managed only by an authenticated tenant admin, be signed or server-authorised, and never be readable by kiosk/KDS devices; actual: any device token can create/replace any staff record (also replace the owner's `pinHash`, or `isActive:false` to lock everyone out) and read every staff `pinHash`.
- Impact: attacker gains a manager identity on POS: approves refunds/voids/high discounts/bill reopen, cash-outs, closes the day, edits menu prices. Reading the hashes gives all real staff PINs offline in <1 ms (F-030).
- Root cause: POS trusts the cloud entity store as authoritative for identity, and the cloud treats a device token as authority to write identity data.
- Recommended fix (smallest change at last trusted decision point): server: restrict `STAFF_USER` writes to tenant-admin sessions (not device tokens) and never return `pinHash` on device pulls; POS: `applyRemoteUser` must ignore records not signed/attributed to an admin, never accept role upgrade to manager/owner/super-admin from sync without an admin signature, and refuse to overwrite an existing user's `pinHash`/`roleId` from an unauthenticated source.
- Suggested regression test: push STAFF_USER with `roleId:'role-manager'` using a KDS/CAPTAIN/KIOSK device token -> expect 403; unit test `applyRemoteUser` rejects unsigned role elevation; pull as a KIOSK device must not include `pinHash`.

### POS-02 No PIN attempt limiting, no failed-attempt audit; login ignores the selected profile; unlock/override not bound to identity
- Severity: medium; Class: CONFIRMED
- CWE/OWASP: CWE-307, CWE-521; A07 Identification and Authentication Failures
- Component + file:line(s): `posStore.ts:436 loginWithPin` -> `repositories.ts:3195 StaffRepository.verifyPin(pin)` (first active user whose hash matches; no user argument, no counter); `PosLogin.tsx:66-72` (calls `loginWithPin(pin)` - the selected card `selectedUser` is cosmetic); `posStore.ts:506-513 unlockTerminal` (any valid PIN unlocks, not the current user); `ManagerOverrideModal.tsx:33-52` (failure branch logs nothing, no delay, no lockout); `AuditRepository.log` is only called on success (`posStore.ts:459`).
- Attacker / precondition: anybody physically at an unlocked/locked POS (customer, fired employee) with a HID macro/mouse clicker; or a cashier attacking the manager PIN prompt.
- Repro: code-trace: 10^4 PIN space shared by ALL staff, so with N staff each guess has N/10^4 chance of logging in as someone; 200 ms `setTimeout` per attempt (`PosLogin.tsx:66`), no counter in `verifyPin`. Manager pad: each Authorize = one guess, unlimited, silent.
- Expected vs actual: escalating delay/lockout after 3-5 failures and an audit event per failure; actual none. A lock is client-only anyway, but nothing raises the bar even for non-technical attackers.
- Impact: manager approval (refund, discount >25 %, void, reopen) and the whole session gate are brute-forceable; nothing shows in the audit log.
- Root cause: PIN check is a pure function over the local user list; no state.
- Recommended fix: persisted (localStorage + in-memory) failure counter with exponential backoff/lockout in `StaffRepository.verifyPin` callers (login, unlock, override); audit failures; bind `loginWithPin` to the selected user id; require the CURRENT user's PIN (or a manager's) for `unlockTerminal`; longer PIN (6+) with a real KDF (PBKDF2/scrypt via WebCrypto) instead of FNV.
- Suggested regression test: 5 wrong PINs -> next attempt refused for N seconds and a `LOGIN_FAILED` audit row exists; override pad likewise.

### POS-03 Manager-approval threshold for discounts is bypassable and inconsistent (item-scope fixed discount, unguarded store actions)
- Severity: medium; Class: CONFIRMED
- CWE/OWASP: CWE-840 / CWE-285; A04 Insecure Design / A01
- Component + file:line(s): `posStore.ts:259-266` (`isHighDiscount` looks only at the per-application `value`: `>25` % or `>₹500` fixed), `posStore.ts:860-885 applyDiscount`, `posStore.ts:892-915 applyDiscountUnchecked` (ITEMS scope stores `itemDiscountAmount: params.value` per selected item), `PosDiscountModal.tsx:130-137` (preview confirms `min(itemTotal, numVal)` per item) and `:175-187`; `pricing.ts:78-91` (line discount = min(line total, value)). Also `posStore.ts:842-866 applyBillDiscountPercent/Flat` have no gate (the SEC-013 store guard covers only `applyDiscount`), `PosCart.tsx:82-95` uses a different threshold (>10 %) and excludes `role-owner`; `ManagerOverrideModal.tsx:40` accepts only manager/super-admin (`repositories.ts:3200`), so an owner is prompted for a PIN nobody can give.
- Attacker / precondition: a logged-in cashier (lower than manager).
- Repro (safe): add three dishes of Rs 300 each; Discount -> scope ITEMS, select all items, type FIXED, value 500 (<= threshold, no prompt). Each line becomes 100 % discounted; totalPayable -> 0 (`pricing.ts:79-91`). Same result via repeated applications.
- Expected vs actual: approval should depend on the effective discount (amount or % of bill), not the per-item parameter; actual: whole bill can be zeroed with no manager PIN and no server-side check (`order-sync` trusts `discountAmount/totalAmount`, `push-order-sync.dto.ts` header comment).
- Impact: revenue leakage/fraud by cashiers; the audit shows `DISCOUNT_APPLIED` under the cashier's own name only.
- Root cause: control keyed to a parameter instead of the resulting money; enforced only client-side.
- Recommended fix: compute the effective `cart.discountAmount / subtotal` after `recomputeCart` in one place (`applyDiscountUnchecked`'s caller) and require approval when it exceeds the limit; route `applyBillDiscount*` through it; make owner an approver.
- Suggested regression test: cashier applies ITEMS/FIXED 500 on 3x Rs 300 -> override prompt appears.

### POS-04 No RBAC inside the POS: any logged-in role can edit menu prices, force-close the business day, adjust stock, move cash
- Severity: medium; Class: CONFIRMED
- CWE/OWASP: CWE-862 / CWE-285; A01
- Component + file:line(s): `App.tsx:339-348` (every tab rendered for any authenticated user), `PosMenuManagerModal.tsx:374-430,2134,2180` (`MenuRepository.updateMenuItem/createMenuItem/deleteMenuItem/updateCategory`, bulk price update), `App.tsx:160,169` (`syncMenuCatalog({push:true})` propagates edits to cloud and to all terminals/kiosk), `PosCloseDayModal.tsx:68-74` (`closeBusinessDay(... forceCloseWithExceptions: true)` hard-coded, no override prompt), `PosCashDrawerModal.tsx:29-35` and `PosShiftAndCashView.tsx:192-199` (cash in/out, no approval; `authorizedBy` is the free-text notes box), grep shows `requestManagerOverride` used only in Cart/Discount/Bills/Orders/KOT views.
- Attacker / precondition: cashier PIN (any role permitted on POS by `canUseTerminal`, `repositories.ts:3218-3222`; custom roles are never blocked).
- Repro: log in as cashier -> Menu tab -> Menu Manager -> change a price to Rs 1 -> saved locally and pushed to cloud; kiosk/QR and other terminals pull it (server does not role-check device pushes).
- Expected vs actual: catalogue pricing, day-close and cash-out are manager functions; actual: only client-side hiding of nothing. Server authority is a device token, so there is no second control.
- Impact: price tampering fleet-wide, day-close with unpaid exceptions, undocumented cash-outs.
- Root cause: local-first design with a role field that is only consulted in five prompts.
- Recommended fix: role/permission table consulted in each repository mutation (or a store-level `can(action)`), manager PIN prompt for price change/close-day/cash-out; server should reject MENU_ITEM pushes from non-admin sources.
- Suggested regression test: cashier session -> `MenuRepository.updateMenuItem` via UI path shows override modal; close-day with open orders requires manager.

### POS-05 POS applies remote order state verbatim, including terminal/settled states and money fields (integrity of settled bills and shift cash)
- Severity: medium; Class: CONFIRMED (code trace across `packages/sync` + `cloud/api`)
- CWE/OWASP: CWE-345 / CWE-639; A08, A01
- Component + file:line(s): `packages/sync/src/outbox.ts:198-215 applyPaymentAndTotals` (overwrites `orderStatus`, `totalAmount`, `subtotal`, `discountAmount`, `paymentStatus`, splits, tax), `:355-372` (accepted whenever `remote.updatedAt >= existing.updatedAt`, a client-chosen value); cloud `order-sync.service.ts:57-90` (upsert by `(restaurantId, externalOrderId)`; any device of the restaurant can overwrite any order; branch not compared; `updatedAt` not server-clocked); `ShiftRepository.getShiftMetrics` `repositories.ts:2100` (shift cash derives from orders with `orderStatus === 'COMPLETED'`).
- Attacker / precondition: any device token (captain, KDS, kiosk) of the restaurant.
- Repro: push an order event with an existing paid order's `externalOrderId`, `status:'REFUNDED'` or `paymentStatus:'PENDING'`/`totalAmount:0`, `updatedAt` in the future; POS `catchUpFromCloud` (every 4 s) rewrites the local settled order; the shift's `expectedCash` and business-day metrics change accordingly.
- Expected vs actual: settled orders immutable except via audited refund/void; actual: overwritten silently.
- Impact: falsify sales/cash reconciliation, hide cash sales, or trigger stock restore; POS reprints show the altered totals.
- Root cause: no monotonic server version/state machine; the client blindly merges.
- Recommended fix: server: reject updates to a `COMPLETED/REFUNDED` order except by allowed transitions and by originating device/branch; use server time for `updatedAt`; POS: refuse remote downgrade of `paymentStatus SUCCESS` and money-field changes on settled orders.
- Suggested regression test: pushing `paymentStatus:'PENDING'` for a settled externalOrderId is rejected server-side and ignored client-side.

### POS-06 Cash-drawer / shift reconciliation can be silently distorted
- Severity: medium (insider, needs a manager approval for (b)); Class: CONFIRMED
- CWE/OWASP: CWE-840; A04
- Component + file:line(s):
  - (a) `repositories.ts:2164-2170 openShift` closes any open shift with `actualCash = expectedCash` ("Automated closure"), i.e. variance 0, no approval; UI `PosShiftAndCashView.tsx:174-183` has no manager gate.
  - (b) `repositories.ts:877` sets `orderStatus='REFUNDED'` even for a partial refund; `:2100` counts only `COMPLETED` orders, so the ENTIRE order total disappears from `expectedCash` while only `refundAmount` left the drawer. A cashier who closes the shift declaring the (lower) expected cash pockets the difference with zero variance. (The extra `activeShift.totalSales -= refundAmount` at `:900-909` is overwritten by `getActiveShift()` re-derivation, `:2136-2150`.)
  - (c) `addCashMovement` (`:2231-2262`) has no approval, unlimited amount, self-declared `authorizedBy`.
  - (d) UPI "paid" is a cashier click (`PosPaymentModal.tsx:173-181` `upiConfirmed`, no UTR/gateway check) and refunds on UPI never call the gateway (`PosBillsView.tsx:317` `=== 'UPI'` vs stored `UPI_QR`).
- Attacker / precondition: cashier (a, c, d); cashier + manager PIN (b).
- Repro (b): Rs 1000 cash order; manager-approved partial refund of Rs 1; expected cash falls by Rs 1000; declare counted = new expected; variance 0.
- Impact: cash skimming with clean-looking Z reports.
- Root cause: shift totals recomputed from order status instead of a ledger of cash events.
- Recommended fix: keep a `refundedAmount` on the order and subtract only that; record shift-close variance for auto-closed shifts (require counted cash); manager approval for cash-out and auto-close; require a UTR/reference for UPI.
- Suggested regression test: partial refund Rs 1 on Rs 1000 cash order -> expectedCash decreases by 1.

### POS-07 Terminal "lock" and inactivity are not real controls (session restored from localStorage without PIN)
- Severity: low-medium; Class: CONFIRMED for logic, SUSPECTED for the reload trigger
- CWE/OWASP: CWE-613 / CWE-306; A07
- Component + file:line(s): `posStore.ts:355-364` (initial `currentUser` restored from `SessionPersistence.load('pos')`, `isLocked:false`), `:418-441 restoreSession`, `:496-505 lockTerminal` (in-memory only), `session_persistence.ts:50-54,79-93` (24 h TTL, plain JSON `{userId, roleId}` in localStorage, `lastActiveAt` never used), `App.tsx:308` (lock => PosLogin), `App.tsx:352-372` (ErrorBoundary offers "Restore POS Workspace" -> `window.location.reload()`); no idle auto-lock (grep found none).
- Attacker / precondition: person at a locked terminal; ability to reload the webview (Ctrl+R, Ctrl+Shift+R, crash-recovery button; F5 is intercepted by the app) - not verified in a built shell.
- Repro: lock terminal, reload -> back in as previous user (possibly a manager). Editing `jamanvaar:session:pos:v1` `userId` to another user id works the same but needs storage access.
- Impact: bypass of terminal lock and of manager identity.
- Root cause: lock state not persisted; session restore needs no proof.
- Recommended fix: persist `locked` in the session record and honour it in `restoreSession`; idle timeout; disable browser reload accelerators (WebView2 `AreBrowserAcceleratorKeysEnabled=false` or intercept Ctrl+R).
- Suggested regression test: lockTerminal -> new store instance (simulated reload) starts locked.

### POS-08 Tauri hardening gaps: CSP null, no ACL/AppManifest, unrestricted printer IPC, no navigation restrictions
- Severity: medium (defence-in-depth; no in-POS script sink found); Class: HARDENING (weakness confirmed = F-028)
- CWE/OWASP: CWE-1021 / CWE-918 / CWE-1188; A05 Security Misconfiguration
- Component + file:line(s): `tauri.conf.json:26` `"csp": null`; no `src-tauri/capabilities/`, `build.rs:1-3` no `AppManifest::commands(...)`, so all six custom commands are open to any script/frame in the webview; `main.rs:65-81` `send_escpos_bytes` (any IP literal/port, unlimited bytes; also blocks the UI thread while connecting); `main.rs:122` `tauri_plugin_shell::init()` registered though the JS side never uses it (denied by ACL today but one added capability or `shell:default` would expose spawn/open; version 2.3.6 is past CVE-2025-31477); no `on_navigation`/`on_new_window` handler; `index.html:11-13` pulls Google Fonts CSS at runtime; menu `imageUrl` from synced data loads arbitrary remote images (no CSP `img-src`), `PosMenuManagerModal.tsx:2107` renders `imageSourceUrl` from menu data as an `href` (`javascript:` not filtered), `PlatformNoticeBanner.tsx:36-37` renders cloud `downloadUrl` unfiltered.
- Attacker / precondition: any script execution in the webview (none found in POS; one sink exists in shared `@jamanvaar/ui` printing HTML - see cross-ref below) or poisoned printer/menu data synced from another device/cloud.
- Repro: code-trace only. If script runs: `invoke('send_escpos_bytes',{ip:'10.0.0.5',port:445,bytes:[...]})` gives a TCP write/port-scan oracle from a workstation inside the restaurant network. Data-driven variant: `printers[].ipAddress/port` come from `db.configuredPrinters`, editable by any role (POS-04) and synced.
- Expected vs actual: strict CSP (`default-src 'self'; connect-src <api>; img-src 'self' data:`), explicit capability file + `AppManifest` limiting commands to the main window, IP allow-list (RFC1918 + saved printer IPs; port 9100 or saved), byte cap; actual none.
- Impact: turns any future XSS or data-poisoning into LAN pivoting, arbitrary TCP send and local-printer abuse; no direct remote exploit today.
- Root cause: security config left at scaffolding defaults.
- Recommended fix: set CSP; add `build.rs` `AppManifest::new().commands(&[...])` + `capabilities/default.json` for the local window only; validate `ip` against configured printers (`db.configuredPrinters`) passed as an id rather than raw IP; remove the shell plugin if not needed (spawn the sidecar via `std::process::Command` or scope `shell:allow-execute` tightly); add `on_navigation` allowing only the app origin; strip `javascript:`/non-https from `href` sinks.
- Suggested regression test: Rust unit test that `send_escpos_bytes("8.8.8.8",80,..)` and `127.0.0.1` are rejected; tauri config test asserting csp is non-null.
- Cross-reference (other slice): `packages/ui/src/ThermalReceiptView.tsx:414,556` builds a full HTML string from `it.name`, `it.specialInstructions`, `order.customerName`, `restaurantName` etc. WITHOUT escaping and `doc.write`s it into a same-origin `about:blank` iframe (`printThermalReceipt` / `printThermalKotTicket`). Only pos-admin calls them (`BillingInvoicesModule.tsx:338`, `KitchenKotModule.tsx:390`, `OrderDetailModal.tsx:33`, `OrdersModule.tsx:974`), not the POS, but guest-supplied special instructions/names (kiosk, QR, captain) flow there: stored XSS with access to that app's localStorage/device token and IPC. Should be triaged in the pos-admin/ui slice.

### POS-09 Remote/UNC printer names accepted by `print_raw_system` (NTLM leak / arbitrary spooler target)
- Severity: low; Class: SUSPECTED (Windows behaviour not tested)
- CWE/OWASP: CWE-73 / CWE-522; A05
- Component + file:line(s): `packages/native/printing.rs:89-94` (`is_safe_printer_name` blocks `"`,`` ` ``,`$`,`;`,`|`,`&`,`<`,`>` but allows `\`), `:186-214` (`OpenPrinterA(name)` with the raw name); name source `printer.systemPrinterName` in `packages/api/src/print_transport.ts:52-58`, editable via printer settings by any role and via synced config.
- Attacker / precondition: ability to set a printer's `systemPrinterName` (cashier via Settings, or synced data) e.g. `\\10.0.0.66\x`.
- Impact: the terminal makes an SMB/RPC connection and Windows may send the user's NTLMv2 challenge response; also prints receipts (customer data) to an attacker print server.
- Root cause: name not validated against the installed-printer list.
- Recommended fix: in Rust, enumerate installed printers and require `name` to be an exact member (reject names starting with `\\`).
- Suggested regression test: `is_safe_printer_name("\\\\host\\p")` false / not in installed list => Err.

### POS-10 ESC/POS control-byte injection from guest-controlled text
- Severity: low; Class: CONFIRMED
- CWE/OWASP: CWE-150 / CWE-74; A03
- Component + file:line(s): `apps/restaurant-system/pos/src/services/printerService.ts:113-172` (`generateReceiptText`, `generateKOTText` concatenate `it.name`, modifier `optionName`, `specialInstructions`, `customerName`, `config.*` with no control-character filtering), `:225-233 wrapEscPos` (`TextEncoder` passes 0x1B/0x1D/0x10 through). Text origin includes kiosk/QR/captain orders pulled from cloud (`outbox.ts:160-180`); cloud limits length (500 chars) but not content.
- Repro: instruction containing `\x1bp\x00\x19\xfa` (ESC p = drawer kick), `\x1dV\x00` (cut), or `\x1d(k...` QR/graphics floods.
- Impact: unauthorised cash-drawer pulses, wasted paper/ticket forgery on the kitchen printer (attacker can shape ticket contents).
- Root cause: printer stream built from unsanitised strings.
- Recommended fix: strip C0 controls (except `\n`) and 0x7F from every interpolated field before encoding; central `sanitizeForPrinter()`.
- Suggested regression test: `generateKOTText` with `\x1b`/`\x1d` in instructions emits none of them.

### POS-11 CSV formula injection in exports
- Severity: low; Class: CONFIRMED
- CWE/OWASP: CWE-1236; A03
- Component + file:line(s): `apps/restaurant-system/pos/src/services/csvExportService.ts:14-33` (customer name quoted but not neutralised; `o.tableNumber`, dish `it.name` at `:47`), and the equivalent export in `PosBillsView.tsx:~371`.
- Attacker: guest-typed name/notes via kiosk/QR/captain; victim opens the export in Excel.
- Fix: prefix cells starting with `= + - @ \t \r` with `'`.
- Test: export order with customerName `=HYPERLINK("http://x","y")` -> cell begins with `'`.

### POS-12 Licence/entitlement handling defects (client-side)
- Severity: low; Class: CONFIRMED
- CWE/OWASP: CWE-602 / CWE-345
- Component + file:line(s): `repositories.ts:1733-1756 setVerifiedLicense` discards `payload.expiresAt` (a signed cert's expiry is only checked at paste time, `license_certificate.ts:80-81`, and never again; `license.validUntil` stays at the hardcoded `2027-12-31`, `db.ts:504-513`); `PosSettingsView.tsx:194` calls `applyLicenseCertificate(cert)` with no `expectedRestaurantId` (same in `pos-admin/SubscriptionPlansView.tsx:288`), so a certificate issued for another restaurant is accepted although `'restaurant-mismatch'` is handled in the UI; default licence is PRO with all entitlements true and a fixed key `JAMAN-PRO-2026-AHM-8842-X` shipped in every client (`db.ts:504-540`, `repositories.ts:1797`); `DeviceGateOverlay` is an overlay only (keyboard shortcuts F1-F10 in `App.tsx:196-240` keep working under it, focus is not trapped); offline check uses client `Date.now()` and a client-stored `lastCheckInAt` (`device_gate.ts:121-127,265-272`).
- Impact: a tenant can keep PRO after expiry/downgrade, or reuse another tenant's cert; can edit `jamanvaar_device_gate_v1` or roll the clock back to defeat the 7-day offline lock. POS gates no feature on this data; server checks (subscription/device status per request) remain authoritative.
- Fix: persist `expiresAt` and check it on read; pass `db.restaurant.id`/activation restaurant id as `expectedRestaurantId`; make the default licence tier CORE/none until a signed one is applied; use server `serverTime` (from heartbeat) plus a monotonic counter to detect clock rollback.
- Test: apply a cert with restaurantId != local -> `restaurant-mismatch`; expired cert after apply -> entitlements drop.

### POS-13 Device token storage and transport
- Severity: low; Class: HARDENING (F-019 client half)
- Component + file:line(s): `cloudClient.ts:14-18,77-84,178-215` (plaintext localStorage; token also read directly for heartbeat/AI calls), `cloudClient.ts:17` default `http://localhost:4000`; no https enforcement; `dist/assets/index-*.js` embeds `localhost:4000`, no `VITE_CLOUD_API_BASE_URL` in `tooling/`/`.github/` (UNVERIFIABLE which URL production builds use).
- Impact: token theft by same-user malware/profile copy; cleartext token if a build is pointed at an `http://` API; a rogue process on :4000 receives the activation code and token on a mis-configured build.
- Fix: keep the token in Windows Credential Manager via a Rust command (or DPAPI-encrypted file), refuse non-https `API_BASE` in production, fail the build when the env var is missing.
- Test: build script asserts `VITE_CLOUD_API_BASE_URL` starts with `https://`.

### POS-14 Supply chain / packaging: committed binaries and build output, unsigned installer, update path with no integrity check
- Severity: low (HARDENING); Class: HARDENING
- Component + file:line(s): `apps/restaurant-system/pos/src-tauri/binaries/JamanvaarLocalCore-x86_64-pc-windows-msvc.exe` (92,957,184 bytes, tracked, commit ae0bea0; auto-spawned at `main.rs:136-141`, cannot be tied to `tooling/local-runtime/*.cjs` source); 2,593 tracked files under `src-tauri/target/` (debug exe/DLLs, e.g. `target/debug/JamanvaarLocalCore.exe`); `tauri.conf.json:44-58` no signing config, `installMode: currentUser`; no updater plugin: updates are a `downloadUrl` from the heartbeat (`app_update.ts`, `device_gate.ts:206-215`), server DTO does not validate it as a URL (`cloud/api/.../application.dto.ts:10 z.string().optional()`), banner renders it raw (`PlatformNoticeBanner.tsx:36-37`); overlay restricts to http(s) (`DeviceGateOverlay.tsx:~68`); no hash/signature verification of the downloaded installer.
- Impact: unverifiable code runs with the POS user's rights; a compromised platform account or cloud can push an arbitrary installer to all terminals (mandatory update locks the terminal until "updated").
- Fix: build the sidecar in CI and drop it from git (add `target/`, `binaries/` to `.gitignore`), Authenticode-sign installers, adopt `tauri-plugin-updater` with a pinned Ed25519 pubkey, validate `downloadUrl` as https on server and client.
- Test: CI check that no `.exe`/`target/` is tracked.

### POS-15 Numbering and terminal identity are per-device (invoice/token collisions across counters)
- Severity: low/info; Class: CONFIRMED
- Component + file:line(s): `repositories.ts:472-486 nextTokenNumber` (max over local orders only), `:551-556` (random `ORD-########` from `generateOrderNumber`, uniqueness checked only against local `db.orders`, `utils/src/uuid.ts:31`), `posStore.ts:342` and `repositories.ts:583-586` (every POS is `POS-01`), `createOrder` idempotency key is a fresh UUID when the caller does not pass one (`:548`, POS callers never pass one), so only UI ref-guards prevent duplicate orders (`PosPaymentModal.tsx` `settlingRef`, `PosCart.tsx` `sendingKotRef`).
- Impact: two counters issue the same token/`POS-01` id; invoice numbers are random not gapless (GST serial rules) and collision-check is local; duplicate-submit protection relies on client-side flags only. Cloud dedupes on the order id, so orders themselves do not collide.
- Fix: terminal-id prefix from activation (`deviceId`) in token/invoice numbers; sequential per-device invoice counter; pass a deterministic idempotency key from the cart.
- Test: two db instances with different terminal ids produce distinct tokens.

### POS-16 Unauthenticated LAN sync client: replaces users/roles/license and pushes the whole DB (F-008 residual)
- Severity: low-medium; Class: HARDENING/SUSPECTED (gated by `local_service.cjs:154` 401 and by needing a listener on the sync URL)
- Component + file:line(s): `db.ts:646-680,717-745,761-810` (no `Authorization` header, no TLS, no pinning, `jamanvaar_sync_server_url` from localStorage), `repositories.ts:451-465 postToLocalService`; `lan_mesh_sync.ts` transport is BroadcastChannel/localStorage only (same browser profile), not network-exposed.
- Impact: whatever answers on `http://<hostname>:5178` (another local user/process if the sidecar is down) can set `users` (PIN hashes, roles) and `license`, and receives orders, customer PII, audit logs and pinHashes via POST.
- Fix: delete the users/roles/license overwrite from the LAN path (or require signed payloads), send the paired bearer, bind sidecar to loopback/verified peers, fail if the sidecar port is already taken by a foreign process.
- Test: `forceSyncNow` with a response containing `users` leaves `db.users` unchanged.

## Controls verified OK (things you checked that are sound; one line each with file:line)
- Devtools are not enabled in release (`Cargo.toml:11` `tauri` features empty; no `devtools` feature) and no `withGlobalTauri`.
- No `tauri-plugin-shell` permission is granted (no capabilities; `gen/schemas/capabilities.json` = `{}`), so JS cannot spawn/open through the plugin; versions are current (`tauri 2.11.5`, `tauri-plugin-shell 2.3.6`, `wry 0.55.1` in `Cargo.lock`).
- `scan_network_printers` refuses public ranges (`printing.rs:79-87`, tested `:346-358`); serial port and baud are allow-listed (`:97-113`, `:285-303`); printer name and file path travel via env vars not script text, `is_safe_printer_name` blocks shell metacharacters (`:89-94,186-214`).
- POS has no HTML injection sinks: no `dangerouslySetInnerHTML|innerHTML|document.write|eval|new Function|window.open` in `apps/restaurant-system/pos/src`; receipts render through React text nodes (`ThermalReceiptView` component) and ESC/POS text.
- Cloud order/device auth: `DeviceAuthGuard` checks device status, restaurant status, subscription, per-app entitlement, branch and lock on every request (`device-auth.guard.ts:47-118`); device token stored hashed server side; cloud sync amounts are integer paise (`push-order-sync.dto.ts`, `outbox.ts:9-10`).
- Double-submit guards on payment and KOT (`PosPaymentModal.tsx` `settlingRef`, `posStore.ts` `kotSentQty` logic + `findRunningOrder`), `createOrder` rejects subtotal lower than item sum (`repositories.ts:520-538`), `splitsMatchTotal` enforced at settle (`:749`), void refused on paid orders and refund capped at total (`:807-877`).
- `calculateCart` clamps discount percent to 0-100, fixed to <= subtotal and taxable >= 0 (`pricing.ts:79-131`), negative quantity cannot be added via UI (`posStore.ts:updateItemQuantity` removes at <= 0); money uses per-step rounding to 2 dp (float + rounding, not integer paise locally, acceptable but see limits).
- Session data contains no PIN/password (`session_persistence.ts:5-6`); PINs stored only as hash (`repositories.ts:3150-3160`), plaintext seed users removed (`seed.ts:747`).
- License and offline-extension certificates are verified with ECDSA P-256 public keys only, no private key in repo (`license_certificate.ts:59-83`, `offline_extension.ts:39-63`, `config/src/license_keys.ts`); extension checks restaurant/branch/device match (`device_gate.ts:159-175`).
- Local core requires a Bearer token on `/api/sync`, `/api/orders`, `/api/events` (`local_service.cjs:40,154`).

## Not verified / limits
- No runtime test in a built Tauri/WebView2 shell: reload accelerators (POS-07), whether `target=_blank`/new-window navigation is blocked, and whether IPC is reachable from a navigated remote origin without an `AppManifest` (POS-08) are code-reasoned, not observed.
- The 92 MB sidecar and `dist/` were not decompiled; I could not tie the sidecar to `tooling/local-runtime` sources (which of `local_service.cjs`, `sync_server.cjs`, `standalone_local_core.cjs` it packages) or confirm its auth behaviour and bind address.
- Production `VITE_CLOUD_API_BASE_URL` value and release signing process are unknown (UNVERIFIABLE).
- Cloud behaviours cited (POS-01, POS-05, F-016) were read from `cloud/api` source but belong to the cloud slice; not exercised, and branch-isolation details of `SyncedEntity/SyncedOrder` RLS were not analysed.
- Not exhaustively read: `PosInventoryView`, `PosReportsView`, `PosDayHistoryView`, `PosKotView`, `PosCustomersView`, `GlobalSearchModal`, `PosChatbot` (AI queries go through `@jamanvaar/business` with the device token; server side untested), `command_pipeline.ts` (F-032), `lan_mesh_sync.ts` after line 200, `packages/database/src/live_db.json` (tracked 240 KB demo data with customer names/phones - owner: database slice).
- Money arithmetic is JS floating point with 2-dp rounding per step (`pricing.ts`, `PosPaymentModal.tsx` strict `totalAllocated !== totalPayable` float compare at `:263`); I did not find an exploitable rounding gap, but split/allocation float comparison can produce spurious rejects.
