# JAMANVAAR enterprise security, authorization, data-integrity and production audit

**Date:** 2026-09-27. **Mode:** read-only. No source, configuration, dependency or database was changed; no external request was made; no secret is reproduced here. The only file written is this report.
**Evidence types used:** CODE TRACE (a request followed through the code to the database), CONFIG (a checked-in configuration value), TEST (an existing automated test that passed in this audit's baseline run: cloud 103 files / 850 tests, root 163 files / 1153 tests). Anything that needs a running deployment is marked **NEEDS RUNTIME VERIFICATION** and is not counted as confirmed.
**Relationship to the earlier audit:** `security-audit/` (2026-09-23, revision `9ddb563`) exists. Its critical/high items were fixed. This audit re-checked the current code independently, including everything added since (QR ordering, order-state rules, branch scoping, device verdict cache, KDS stations). Where a finding below overlaps an earlier one, it says so.

## 1. Architecture map (what exists)

| Application | Location | Shell | Notes |
|---|---|---|---|
| Super Admin | `cloud/super-admin-web` | web (React/Vite) | platform-staff console; httpOnly-cookie session |
| Restaurant Admin **and** POS Admin | `apps/restaurant-system/pos-admin` | Tauri + web | **one application**; its sign-in screen says "Restaurant Admin", its window title "POS Admin". There is no separate POS Admin app in the repository |
| POS | `apps/restaurant-system/pos` | Tauri (+ sidecar `JamanvaarLocalCore`) | counter terminal |
| KDS | `apps/restaurant-system/kds` | web/PWA only (no Tauri project found) | |
| Captain | `apps/restaurant-system/captain` | web/PWA only (no Tauri/Capacitor project found) | |
| Kiosk | `apps/kiosk-system/kiosk-user` | Tauri | public self-order terminal |
| Kiosk Admin | `apps/kiosk-system/kiosk-admin` | Tauri | |
| QR guest ordering (extra) | `apps/qr-guest` | web | public, token-in-URL |

**Backend:** NestJS 10 on Express (`cloud/api`), Prisma 5 on PostgreSQL. Three authentication realms: platform staff (JWT + OTP + httpOnly refresh cookie, `PlatformAuthGuard`), tenant owner/manager users (`TenantAuthGuard`), and devices (opaque bearer token, SHA-256 hashed at rest, `DeviceAuthGuard`, re-checked on every request). Platform authorization is an area table (`common/rbac/access.ts`, deny-by-default). Tenant isolation is PostgreSQL row-level security with `SET LOCAL app.current_restaurant_id` (`prisma.service.ts:127-146`), on 41 of 58 tables. Background jobs: `JobsService` (15-minute scheduler). Realtime: SSE plus PostgreSQL LISTEN/NOTIFY relay. Webhook: one (Cashfree). Outbound HTTP: fixed hosts only (Cashfree, Meta Graph, MSG91). Uploads: one (platform master-catalog image, JSON/base64, not multipart) and device backups (JSON).

**Route inventory** (`security-audit`-style, generated for this audit by parsing controller decorators; 218 routes recognised): `PlatformAuthGuard` 148, `DeviceAuthGuard` 35, `TenantAuthGuard` 25, unguarded 10. The unguarded set is exactly the intended public surface plus login-type routes: Cashfree webhook, platform refresh, platform-users activation status, QR public routes (`/public/qr/*`, legacy `/qr-guest/*`, images), and (not caught by the parser because their decorators differ) tenant login/reset/refresh, activation redeem, restaurant lookup. No route was found that returns tenant data without a credential.

**Local / offline:** each terminal keeps its database in the WebView (localStorage/IndexedDB or OPFS) with a sync outbox (`packages/sync`); the Branch Core (`packages/branch-core`, Node `node:sqlite`) is the LAN hub. A legacy `tooling/local-runtime/local_service.cjs` still exists.

**Infrastructure in repo:** one GitHub Actions workflow (`.github/workflows/tauri-build.yml`), no Dockerfile, no deployment manifests. TLS, reverse proxy, CORS origins, `NODE_ENV`, database exposure are outside the repository.

## 2. Findings

Format is abbreviated where every field would repeat; each entry keeps: ID, severity, confidence, evidence (file:line), path, who, impact, root cause, smallest safe fix, regression risk, verification test.

### P1 (high)

**F-01. Any device type can write menu, price, tax, customer, cash and payment-record entities.**
Severity P1, confidence HIGH (CODE TRACE, complete). App: cloud API; all device apps. Route: `POST /api/v1/entity-sync/:entityType`.
Path: `entity-sync.controller.ts:55-60` `push` → `assertDeviceMayWrite` (`:37-42`) → `entity-sync.service.ts:55` `pushEventsForRestaurant` → `syncedEntity.create/update`. `ENTITY_WRITE_ALLOWED_DEVICE_TYPES` (`:33-35`) lists **only** `STAFF_USER`. `SYNCABLE_ENTITY_TYPES` also contains `MENU_ITEM, MENU_CATEGORY, MODIFIER_GROUP, TAX_GROUP, DINING_TABLE, CUSTOMER, COUPON, COMBO, SHIFT, CASH_MOVEMENT, PAYMENT_TRANSACTION, INVENTORY_ITEM, CUSTOMER_FEEDBACK` (`dto/push-entity-sync.dto.ts:25`), all writable by KDS, Kiosk, Captain.
Scenario: a stolen or compromised KDS/Kiosk/Captain credential (the least-trusted, most exposed devices) pushes `MENU_ITEM {price: 1}` or `TAX_GROUP {igstPercent: 0}`. Every POS, Kiosk and Captain pulls it on the next sync (no publish step for devices), and the QR menu snapshot is built from the same entities, so guests order at the altered price the next time the restaurant presses Publish (or at first automatic publication). `CUSTOMER`, `SHIFT`, `CASH_MOVEMENT` and `PAYMENT_TRANSACTION` records can be forged or overwritten the same way.
Affected: prices, taxes, CRM, cash-drawer and reconciliation records of one restaurant (RLS confines it to that restaurant). Root cause: the earlier CRIT-01 fix restricted one type instead of defining write authority per type.
Smallest safe fix: extend `ENTITY_WRITE_ALLOWED_DEVICE_TYPES` to every type (menu/tax/table: POS_ADMIN, KIOSK_ADMIN for kiosk catalogue; CUSTOMER: POS, POS_ADMIN, CAPTAIN; SHIFT/CASH_MOVEMENT/PAYMENT_TRANSACTION: POS, POS_ADMIN; INVENTORY_ITEM: POS_ADMIN; SERVICE_MESSAGE: all).
Regression risk: MEDIUM: POS currently pushes the menu (`apps/.../pos/src/App.tsx:159,180` `syncMenuCatalog({push:true})`) and Captain pushes tables; the allow-list must reflect real flows. Verification test: for each (type, device type) pair, push and assert 403 or 200 per the table; assert KDS cannot change a dish price.

**F-02. Every device type receives every staff PIN hash, all customer records and the cash/payment entities; the PIN keyspace is 10,000.**
Severity P1, confidence HIGH (CODE TRACE + design comment). Route: `GET /api/v1/entity-sync/:entityType` (`entity-sync.controller.ts:59-62`, no per-type restriction; the header comment at `:26-31` states pulling `STAFF_USER` by all device types is deliberate). PIN storage: PBKDF2-SHA256, 100,000 iterations (`packages/database/src/pin.ts:45`), 4-digit PINs (10,000 candidates), plus a legacy FNV-1a format still accepted for verification (`pin.ts:42,120`, "verify-only").
Scenario: a Kiosk or KDS credential pulls `STAFF_USER`, then tests 10,000 PINs offline per hash: about 5 to 13 minutes single-threaded per user with the modern format (30 to 80 ms per check, per the file's own comment), seconds with a GPU; legacy hashes fall instantly. The recovered manager/owner PIN unlocks the terminal-side controls (discount approval, refund, void, cash removal), which are enforced only on the client (see F-10). `CUSTOMER` pulled by a public kiosk exposes names and phone numbers of the whole restaurant.
Impact: credential confidentiality equals that of the weakest device; customer PII exposure. Root cause: offline PIN verification requires the hash on every terminal.
Smallest safe fix (batch 1): stop distributing `STAFF_USER` and `CUSTOMER` to KIOSK/KIOSK_ADMIN devices; filter pull by device type; migrate remaining legacy `pinv1` hashes at next login. Larger fix (needs a decision): a per-device verifier that is useless off that device, or online-only manager approval.
Regression risk: MEDIUM-HIGH (Kiosk staff login and offline flows). Verification test: a KIOSK credential receives 403/empty for `STAFF_USER`/`CUSTOMER`.

**F-03. A device credential can create an order that is already "paid".**
Severity P1, confidence HIGH on the code path, MEDIUM on business impact. Route: `POST /api/v1/orders/sync`. `order-sync.service.ts:185` computes `paymentViolation` only `existing ? ... : null`, so on creation `paymentStatus: evt.paymentStatus` (`:285`) and `totalAmount` are stored as sent by any device type (POS, Kiosk, Captain, KDS). Payment-state protection applies only after an order is already settled.
Scenario: a compromised or malicious terminal inserts orders with `paymentStatus: SUCCESS`, `paymentMethod: CASH`, arbitrary totals. They count as sales in `reports.service.ts` (`isSale`: `paymentStatus = 'SUCCESS'`) and in restaurant/central reports; nothing moves money, so the harm is falsified sales, GST and reconciliation records. The order-integrity flags added in the last phase flag inconsistent totals but do not stop this.
Fix: only device types with payment authority (POS, POS_ADMIN, and server-side flows) may create or set `SUCCESS`; a Kiosk/Captain order starts `PENDING`; gateway payments are marked by the webhook only. Regression risk: MEDIUM (kiosk pay-at-counter flow). Test: KIOSK push with `SUCCESS` is stored as `PENDING` or refused.

**F-04. The signing secret for every access token can be weak, and production does not check.**
Severity P1, confidence MEDIUM (**NEEDS RUNTIME VERIFICATION** of the deployed value). `config/env.validation.ts:10` requires only 32 characters. The development `.env` on this machine holds a value containing the word "change", 20 distinct characters, two character classes (checked without printing it). Platform and tenant JWTs, and the QR session HMAC (`qr-session.ts`, fallback to the same secret), depend on it. If production reuses a placeholder-grade secret, tokens can be forged (issuer/audience are pinned but the signature would be guessable), which is complete platform takeover.
Fix: in production, reject secrets that are short of 48 characters, low-entropy, or contain placeholder words; separate the QR session secret. Regression risk: LOW. Test: boot with `NODE_ENV=production` and a weak secret must fail.

### P2 (medium)

**F-05. An `ANY` activation key lets the person who redeems it choose the device type, including the admin consoles.**
Confidence HIGH. `dto/activation-key.dto.ts:6` defaults `allowedDeviceType` to `ANY`; `activation-keys.service.ts:298` only compares types when the key is not `ANY`, then `:359` creates the device with the type the redeemer sent. Anyone holding a key issued for "a terminal" can become `POS_ADMIN` or `KIOSK_ADMIN` (fleet commands, menu publish, QR management). Bounded by the key being a secret handed to the restaurant, but an installer of a kitchen screen gains console rights. Fix: make the type required at generation, or refuse console types for `ANY` keys. Risk LOW. Test: redeem an `ANY` key as `POS_ADMIN` must be refused.

**F-06. Licence certificate of one restaurant can be applied to another; local licence state is client-mutable and clock-based.**
Confidence HIGH (code path), impact bounded because the cloud enforces application entitlements per request. `packages/business/src/license_certificate.ts:110,118` skips the restaurant check when `expectedRestaurantId` is absent; both callers omit it (`pos/.../PosSettingsView.tsx:194`, `pos-admin/.../SubscriptionPlansView.tsx:284`). Expiry is compared with the device clock (`:78`); no rollback guard was found. Local features gated by the local licence can be unlocked by pasting another restaurant's certificate, editing local storage, or rolling the clock back offline. Fix: pass the device's own restaurant id at both call sites; add a monotonic-time guard. Risk LOW. Test: mismatched certificate returns `restaurant-mismatch`.

**F-07. A development licence-signing public key is a trusted anchor in the production client bundle, and the private signing key sits in a OneDrive-synced `.env`.**
Confidence HIGH. `packages/config/src/license_keys.ts` lists key `k2` with the comment "Development key ... Replace this entry ... before shipping". Whoever holds that key's private half can mint certificates every terminal accepts. `cloud/api/.env` (untracked, git-ignored) contains a licence private key and SMTP credentials and lives under a OneDrive path, so it is replicated to a consumer cloud service. Fix: remove `k2` from the shipped list; keep production secrets out of synced folders; rotate what was synced (needs approval). Risk LOW.

**F-08. Branch Core is plain HTTP by default and clients do not authenticate it.**
Confidence HIGH (code), LAN attacker required. TLS is opt-in (`branch-core/src/main.ts:108`, flags `--tls-cert/--tls-key`); the client (`packages/sync/src/diagnostics.ts:64-85`) probes `/discover`, checks only that the service name matches, and never compares the restaurant id or pins the advertised certificate fingerprint. Every request carries the device's bearer token in cleartext, and that same token is valid against the cloud from anywhere (`DeviceAuthGuard`). A LAN observer or a rogue host at an address a user is talked into entering obtains device credentials. Fix: require TLS with fingerprint pinning at pairing; verify `restaurantId` in `probeCore`. Risk MEDIUM (installation flow). Verification: pair against a core with a mismatched restaurant id must fail.

**F-09. The Branch Core stores its cloud credential in plaintext.**
Confidence HIGH on plaintext, file permissions NEEDS RUNTIME VERIFICATION. `branch-core/src/main.ts:48` writes `device_token` (a console-type credential, because a core must be a POS_ADMIN to fetch the roster) into `branch-core.sqlite3` with no encryption or file-mode restriction (`store.ts:60`). Filesystem access to the branch machine yields a console credential. Fix: OS-protected storage (DPAPI/keyring) or at least a 0600 file. Risk LOW-MEDIUM.

**F-10. Staff-level authorization (cashier vs manager) exists only in the client; the server sees a device and self-declared names.**
Confidence HIGH. The server authorizes terminal calls by device type (`payment-orders.controller.ts:32` lets any POS/POS_ADMIN device refund; `order-sync` accepts `meta.cashierName/captainName` as free text, `dto/push-order-sync.dto.ts:42-43`). Anyone at a terminal who bypasses the UI (local DB edit, crafted request with the device token) has all of that terminal's authority; actions are attributed to a name they typed. Consistent with the earlier MED-06; the server-side pieces added since (order state rules, price flags) narrow but do not close it. Fix direction (needs a product decision): manager approval tokens verified on the server for refunds, discounts and price changes. Not a small change.

**F-11. Unauthenticated credential endpoints use the general 120 requests/minute/address limit, not the strict 20/minute limit.**
Confidence HIGH. `tenant-auth.controller.ts` `login`, `set-initial-password`, `forgot-password`, `reset-password`, `activate-device`, `refresh` (`:68-166`) and `activation-redeem.controller.ts:15` carry no `@PublicAuthThrottle()`; only the two `*-owner` variants and restaurant lookup do (`throttle.ts:41`). Per-account lockout (10 attempts, 15 minutes: `tenant-auth.service.ts:965-966`) limits guessing one account, but one address may spray 120 accounts/minute. Fix: apply `PublicAuthThrottle` to those routes. Risk LOW.

**F-12. WITHDRAWN (false positive). `QrCode` is tenant-owned; row-level security is already enabled and forced on it (verified live in `pg_class`; the earlier static read of the creating migration missed the policy added later).**
Confidence HIGH (added in the QR phase). The migration `20260926100000_qr_ordering_saas` creates the table with no policy; every admin query filters by `restaurantId` (`qr-admin.service.ts:100,197,262,270`) and the public path reads by token as platform (`qr-public.service.ts:95`). One forgotten filter would leak across tenants. Fix: enable and force RLS with the standard policy; public token lookup already runs as platform. Risk LOW.

**F-13. One 20 MB JSON body limit applies to every route, including unauthenticated ones.**
Confidence HIGH. `main.ts:23-24`. Any anonymous caller can make the process buffer and parse 20 MB per request on login, QR and webhook-adjacent routes. Fix: 100 KB default, 20 MB only on the backup upload route. Risk LOW-MEDIUM (find every large legitimate route: backups, menu import).

**F-14. Backups are stored unencrypted when the key is absent or malformed.**
Confidence HIGH. `backups/backup-storage.service.ts:54-62,157-165`: without `BACKUP_ENCRYPTION_KEY_B64` (optional in `env.validation.ts:40`), or with a wrong-length key (only a warning), the backup, which includes customers and PIN hashes, is stored gzip-only, locally or in S3. Fix: refuse to store when the key is unset in production. Risk LOW.

**F-15. Security-relevant changes are not audited.**
Confidence HIGH. Audit actions (`grep` of `action:` across modules) cover platform, billing, keys, devices and logins, but there is no record for entity-sync writes (prices, staff, customers) or for failed logins/lockouts (`LOGIN_FAILED` does not exist). F-01/F-02 abuse would leave only `SyncedEntity.deviceId`, overwritten on each update. Fix: audit price/tax/staff/cash writes with old and new value; audit lockouts. Risk LOW.

**F-16. Reverse-proxy client address handling is not configured (NEEDS RUNTIME VERIFICATION).**
`main.ts` never sets Express `trust proxy`. Behind a proxy every request appears to come from the proxy's address, so per-address limits (login, QR, terminal sync) apply to everyone together; if someone later sets it to `true` carelessly, addresses become spoofable. The terminal-sync ceiling (`throttle.ts`, now 12,000/minute, raised in the last phase from 1,500 because one branch shares an address) matters here. Verify against the real deployment.

### P3 (low)

* **F-17.** Tauri CSP allows `connect-src` to any `https:`/`http:` host and `img-src http:` (`tauri.conf.json:26`, all four Tauri apps); the POS registers the shell plugin and exposes `print_raw_system`, `print_serial` (`pos/src-tauri/src/main.rs:95,101,110`) to the WebView without port/printer allow-lists (the network printer path has one via `printing::is_allowed_printer_target`). No XSS sink was found (one `dangerouslySetInnerHTML` of a locally generated QR SVG, `OnboardRestaurantPage.tsx:1737`), so this is excessive privilege, not an exploit.
* **F-18.** Tokens in browser storage: device tokens and tenant refresh tokens are kept in `localStorage` in the kiosk/POS/admin webviews (`kiosk-admin/src/cloud/cloudClient.ts:38,233,331`). Acceptable only while no script injection exists. The Super Admin console correctly uses httpOnly cookies.
* **F-19.** The legacy `tooling/local-runtime/local_service.cjs` (0.0.0.0:5178) still exists: one shared service key compared with `===` (`:46`), also accepted from `?key=` in the URL (`:45`), a global pairing lockout an attacker can trigger to block installers (`:36-40`), a hard-coded demo restaurant id (`:265`). Whether it is still shipped: NEEDS RUNTIME VERIFICATION.
* **F-20.** Logs: the legacy QR route `GET /api/v1/qr-guest/session?token=...` and `/qr-guest/orders/:id` are not covered by `redactUrl` (`common/request-context.ts`, `main.ts:48`), so the QR token or order reference is written to the HTTP log. Email failures log the recipient address.
* **F-21.** `refresh` is check-then-revoke, not atomic, and reuse of a revoked refresh token is refused but does not revoke the session family (`tenant-auth.service.ts:683-691`).
* **F-22.** Restaurant codes are `JM` + the owner's mobile number (`restaurant-code.util.ts`) and `POST /restaurant-lookup/resolve` returns id and name, throttled to 20/minute: it confirms whether a given phone number is a customer.
* **F-23.** bcrypt cost 10 (`tenant-auth.service.ts:225`); the CORS default list (localhost origins, credentials on) applies whenever `CORS_ALLOWED_ORIGINS` is unset (`main.ts:55`); the platform image upload names files with `Math.random` and writes into the web app's `public/` folder (`master-catalog.service.ts:296-303`, safe content sniffing present); the CI workflow has no `permissions:` block and unpinned action tags (`tauri-build.yml`); `@types/pg` was added to production `dependencies` in the last phase.
* **F-24.** Webhook: signature (HMAC-SHA256 over timestamp+body, timing-safe) and amount/currency checks are correct, but the timestamp is not checked for freshness (`cashfree-gateway.service.ts:153-162`); replay is neutralised by the unique event key and terminal-state check, so this is hardening only.

## 3. Multi-tenant result

* **Tenant/restaurant isolation: evidence FOR.** RLS enabled and forced on 42 tables with `SET LOCAL` context inside every transaction; `runAsTenant` validates the restaurant id as a UUID before interpolating it (`prisma.service.ts:139-144`), the only two raw-unsafe statements in the code base; TEST: `tenant-isolation.e2e`, `rls-platform-reads.e2e`, `order-sync-and-suspension.e2e` (a device of another restaurant cannot see or push), all passed. Tables without RLS: 16 of 58, all platform-global by design except `AuditLog` and `PlatformNotification` (carry a restaurant id; not exposed to tenants by any route found).
* **Branch isolation: evidence FOR** for orders and inventory (branch filter in `catchUp`, `inventory-ledger`; TEST: `onboarding-hardening`, `ecosystem.e2e`, `audit-probes`) and, since the last phase, for the floor plan. **Against:** a restaurant-wide admin console sees all branches by design; other entity types (menu, customers, staff) are restaurant-wide by design.
* **Device isolation: evidence FOR** cross-restaurant (credential resolves to one device row; `DeviceAuthGuard` re-checks every request; TEST `device-enforcement`, cache invalidation test). **Against** within one restaurant: F-01, F-02, F-03 (least-trusted devices hold broad authority).
* **Role isolation:** platform roles are enforced server-side and deny-by-default (TEST `rbac.e2e`); tenant users have three roles and only owner-level user management is server-enforced; terminal staff roles are client-side only (F-10).

## 4. Authorization matrix (server-side, as implemented)

Platform staff (`common/rbac/access.ts`): PLATFORM_OWNER all write; SUPER_ADMIN all write except settings read; PLATFORM_OPS devices/ops/licensing write, rest read; SUPPORT_ADMIN support write, rest read; FINANCE_ADMIN subscriptions+billing write; READ_ONLY read. Unknown paths: owner-level roles only.

| Device type | Orders (create/update) | Menu/tax/customer/cash entities | Staff PINs | Payments | Fleet commands | Other |
|---|---|---|---|---|---|---|
| POS | yes; set paid; refund | write (F-01) | read/write | refund | no | inventory |
| POS_ADMIN (Restaurant/POS Admin console) | yes; refund; state corrections | write | read/write | refund | yes, own restaurant | publish menu, QR admin, KDS station, branch prices |
| Captain | yes (create/paid allowed, F-03) | write (F-01), read all | read | none | no | tables |
| KDS | yes (any status forward-only) | write (F-01), read all | read | none | no | |
| Kiosk | yes (cannot advance to READY/COMPLETED) | write (F-01), read all | read | create payment order | no | |
| KIOSK_ADMIN | yes | write | read | create payment order, push payment menu | kiosk fleet only | |
| Tenant OWNER/MANAGER/STAFF users | none of the terminal APIs | none | none | none | none | OWNER creates/disables logins; console login |
| Public (QR guest) | create QR orders (server-priced) | none | none | none | none | rate-limited |

## 5. Licence / entitlement result

Paid **cloud** functionality cannot be bypassed from a client: entitlements are resolved on the server (`ApplicationEntitlementsService.resolve`), enforced on every device request (`device-auth.guard.ts`), at key generation and redemption, with a per-application device quota now serialised by a lock (TEST: `device-limit`, `device-enforcement`, `audit-probes` P-FIXED-2, `branch-devices-config`). Certificates are ECDSA P-256 verified against baked-in keys (real signature check). **Local** licence state is advisory and bypassable: F-06 (cross-restaurant certificate), local storage edit, clock rollback (NEEDS RUNTIME VERIFICATION), F-07 (development key trusted).

## 6. Offline POS result

* Local data: unencrypted WebView storage; PIN hashes, customers and orders are readable by anyone with the machine (F-17/F-18 context); the Branch Core database holds a console credential in plaintext (F-09).
* Offline authentication: local PIN only, no server check; brute-force limits are client-side.
* Sync integrity: strong on the server side: exactly-once event claim, per-order locks, gapless sequence, item-level merge, order state rules, stale-header protection (TEST `sync-events-and-sequence`, `onboarding-hardening`, `sync-chaos`, `ecosystem.e2e`, `sustained-load`). Client fixes for clock skew and event ids are tested (`multi_app_client_hardening`).
* Duplicate prevention: idempotent by event id and order id; the 100-concurrent-retry test yields one order (TEST `qr-scale`).
* Tamper resistance: low against a local attacker (F-06, F-10); the server bounds the damage per restaurant only.

## 7. Payment result

Server-side pricing for Kiosk and QR orders; payment creation is device-typed (only Kiosk devices create payment orders, only POS devices refund); ownership filters on every payment read (`payments.service.ts:118-124`); refunds are in one locked transaction; webhook signature (constant-time HMAC), amount and currency validation, unique event key, terminal-state guard (`payments.service.ts:216-330`). Gaps: F-03 (orders can be created as paid through order sync), F-10 (refund authority is per device, not per person), F-24 (no timestamp freshness).

## 8. Top 10 risks (by severity and evidence)

1. F-01 device-type write authority missing for prices/tax/customers/cash (P1, HIGH).
2. F-02 PIN hashes, customer PII and financial entities distributed to every device (P1, HIGH).
3. F-03 any device can create paid orders (P1, HIGH path).
4. F-04 weak access-token secret accepted in production (P1, needs runtime).
5. F-05 `ANY` activation key can become a console (P2, HIGH).
6. F-08 Branch Core cleartext HTTP, unauthenticated pairing (P2, HIGH).
7. F-07 development signing key trusted; secrets in synced folder (P2, HIGH).
8. F-10 staff roles are client-only (P2, HIGH).
9. F-11 credential endpoints on the weak throttle (P2, HIGH).
10. F-12 `QrCode` without RLS (P2, HIGH).

## 9. Immediate containment (before any release)

Confirm the production `JWT_ACCESS_SECRET` is random and long (F-04); remove development key `k2` from the terminal bundle (F-07); do not sync `cloud/api/.env` and consider rotating the credentials it holds (needs approval); make sure the deployed Branch Cores use TLS or are on an isolated network (F-08); confirm backups are encrypted in production (F-14).

## 10. Safe fix batch 1 (smallest, high-confidence)

F-11 (throttle decorators), F-05 (refuse console types for `ANY`), F-06 (pass restaurant id), F-12 (RLS on `QrCode`), F-13 (body limit per route), F-20 (redact legacy QR routes), F-14 (require key in production), F-04 (secret quality check), F-15 (audit lockouts and price/staff writes). F-01 and F-03 next, with a per-(type, device) table agreed first.

## 11. Human approval required

Anything touching: production configuration and secrets (F-04, F-07, F-14), credential rotation, authentication behaviour (F-05, F-11), permissions (F-01, F-02, F-03, F-10), database migrations (F-12), customer data flows (F-02), payments (F-03, F-10), infrastructure (F-08, F-16).

## 12. Unverified areas

* Nothing was run against a deployment: TLS, reverse proxy, CORS list, `NODE_ENV`, `trust proxy`, real secrets, database exposure, Docker.
* No dependency scan was run (it needs the network). The last recorded scan is `security-audit/_work/_npm_audit_root.json` (2026-09-23: 3 high, 7 moderate, 1 low, no critical; mostly transitive NestJS/Multer/lodash/React Router), which predates the addition of `pg`; a fresh `npm audit` and `cargo audit` are needed. Dependency ages were not treated as vulnerabilities.
* No Rust dependency review, no decompilation of the sidecar binary, no review of installers/signing (none found).
* Runtime behaviour of clock rollback on licences, filesystem permissions of local databases, tenant-login user enumeration timing, and concurrent refresh-token use were not exercised.
* KDS and Captain have no native shell in the repository; their packaging security is unknown.
* The Super Admin front-end, POS and Kiosk source were searched for storage and XSS sinks but not read line by line.
* Live exploitation was not attempted; F-01 to F-03 are code traces with the executable verification tests listed above still to be written.


---

## Remediation status (update after the fix pass)

Verified by tests: full cloud suite 105 files / 862 tests pass (run with a real Postgres, RLS enforced); root suite 164 files / 1155 tests pass; `tsc -b` has no errors in `apps/`, `packages/`, `cloud/` sources (pre-existing type errors remain only in a few `tests/*.ts` files, unrelated to this work).

| Finding | Status | What was done |
|---|---|---|
| F-01 write authority per device type | FIXED | `entity-authority.ts` table enforced in the controller; kiosk/KDS/captain cannot write prices, tax, staff, customers, cash, payments. Tests: `security-hardening.e2e`, `.unit`, `entity-sync.e2e` |
| F-02 PIN hashes / customers to public kiosk | FIXED | kiosk cannot read CUSTOMER/SHIFT/CASH/PAYMENT; STAFF_USER pulls are role-filtered per terminal; kiosk manager override now calls `POST /api/v1/staff/verify-manager-pin` (server-side PBKDF2, per-terminal and per-restaurant lockout, audited) |
| F-03 orders declared paid | FIXED | only POS/POS_ADMIN may declare SUCCESS/REFUNDED; others need a settled payment transaction, else a `PAYMENT_UNVERIFIED` conflict; voids/refunds/status corrections audited |
| F-04 weak secrets accepted | FIXED | production boot refuses placeholder/short/repeated JWT and QR secrets, localhost/* CORS, malformed backup key (`productionConfigProblems`) |
| F-05 ANY code as admin console | FIXED | refused at redemption |
| F-06 licence bound to restaurant | FIXED (client) | both POS and POS Admin pass the device's own restaurant id. Not fixed: clock rollback guard (needs a monotonic time source; documented residual) |
| F-07 development signing key | FIXED (bundle) | `k2` is included only in non-production builds. **Action for you:** certificates must be signed with the production key (`k1` or a new one); the private key in the OneDrive-synced `cloud/api/.env` must be moved out of the synced folder and rotated. Cannot be done from code |
| F-08 Branch Core identity | PARTLY | pairing now verifies the core belongs to this device's restaurant (test `probe_core_restaurant`). TLS fingerprint pinning and mandatory TLS are NOT implemented (residual, needs installation-flow decision) |
| F-09 Branch Core credential at rest | PARTLY | data dir 0700 / files 0600 where the OS supports it. On Windows no change: OS-protected storage (DPAPI) not implemented |
| F-10 staff roles client-only | PARTLY | manager override on kiosk is server-verified; POS/Captain roles remain enforced on the client (residual, large change) |
| F-11 public auth throttles | FIXED | `PublicAuthThrottle` on the six tenant auth routes and redemption |
| F-12 QrCode RLS | WITHDRAWN | false positive |
| F-13 body limits | FIXED | per-route limits; anonymous callers never get a large limit |
| F-14 unencrypted backups | FIXED | refused in production without key |
| F-15 audit gaps | FIXED | failed logins, lockouts, refresh reuse, sensitive entity changes audited |
| F-16 proxy / client address | FIXED | `TRUST_PROXY` (count of proxies) |
| F-17 Tauri CSP / IPC | PARTLY | `form-action 'none'` added. `connect-src`/`img-src` must stay broad (cloud host and LAN Branch Core are set per installation). Printer/serial command allow-lists (Rust) NOT changed |
| F-18 tokens in localStorage | ACCEPTED | no injection sink found; stays a documented residual |
| F-19 legacy local service | FIXED | constant-time key compare, key accepted from headers only |
| F-20 log redaction | FIXED | legacy QR routes redacted |
| F-21 refresh rotation race | FIXED | atomic revoke, reuse detection ends all sessions |
| F-22 restaurant-code enumeration | ACCEPTED | throttled; changing the code format is a product decision |
| F-23 hygiene | FIXED | bcrypt cost 12, CORS default not applied in production, CSPRNG file names, CI `permissions: contents: read`, `@types/pg` moved to devDependencies. Action-tag pinning to commit SHAs NOT done (needs network lookup) |
| F-24 webhook freshness | ACCEPTED | replay already neutralised |

### What this does NOT prove
Deployment configuration and secret rotation, dependency vulnerability scan (needs network), Rust/Tauri code and real hardware, TLS at the real edge, penetration testing of a running deployment.
