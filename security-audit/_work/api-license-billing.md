# api-license-billing audit

Reviewed revision: `9ddb5633c4679a295dfaa25a80a18dbc7912a82b` (main). Read-only, code-trace audit. No servers started, no network calls.

## Scope actually read (list of files/dirs, and what you did NOT cover)

Read in full (cloud/api/src):
- `modules/activation-keys/*` (service, both controllers, dto)
- `modules/licensing/*`, `modules/plans/*` (incl. entitlements.ts), `modules/subscriptions/*`, `modules/application-entitlements/*`, `modules/applications/*`
- `modules/billing/*` (invoices.service 1-929, both controllers, dto)
- `modules/payments/*` (payments.service, cashfree-gateway.service, webhook controller, payment-orders controller, payment-connections.service, kiosk/platform controllers, menu-sync, pricing.util, dtos)
- `modules/offline-policy/*`, `modules/notifications/*` (receipts controller, gateway, email service/templates), `modules/platform-notifications/*` (controller + first 160 lines of service; rest grep-checked for raw SQL)
- `modules/master-catalog/*`, `modules/backups/*` (service, storage, 4 controllers), `modules/jobs/*`
- `common/guards/{platform,tenant,device}-auth.guard.ts`, `entitlement.guard.ts`, `common/rbac/access.ts`, `common/security/{token.util,session-state,credential-encryption.util}.ts`, `prisma/prisma.service.ts`, `main.ts`, `app.module.ts`, `config/env.validation.ts`
- `prisma/schema.prisma` models: Plan, Subscription, ApplicationEntitlement, ActivationKey, Device, Invoice, Payment, AppRelease, Backup, Order, PaymentTransaction, RestaurantPaymentConnection, Refund, WebhookEvent, PlatformNotification
- Cross-slice, only to verify old claims: `modules/tenant-auth/tenant-auth.service.ts:370-520` (activateDevice), `modules/reports/{controller,service}` CSV export, `packages/business/src/license_certificate.ts`, `cloud/super-admin-web/src/lib/csvExport.ts` + device/audit export pages, `apps/restaurant-system/pos-admin` pay caller.

NOT covered: RLS policy SQL in `prisma/migrations/*` (assumed FORCE RLS as described; I only saw the wrapper), tenant-auth other routes, support impersonation, order-sync/entity-sync, ai-assistant, qr-ordering, devices module, clients beyond the callers noted, deployment/static hosting of super-admin-web, real env values (CASHFREE_*, BACKUP_*), proxy/`trust proxy` effect on the throttler IP key. No runtime reproduction of the races (would need Postgres + server); they are code-traced.

## Inventory (endpoints / entry points in my slice)

Global: `ThrottlerGuard` 120 req/60 s per IP (app.module.ts). No global ValidationPipe; DTO validation is per-route zod pipe (master-catalog has none). Platform RBAC = `PlatformAuthGuard` + `areaForPath` (deny-by-default, area by URL prefix, read=GET/HEAD/OPTIONS else write).

| Method + route | Auth | Role / scope | Notes |
|---|---|---|---|
| `GET/POST/PATCH/DELETE /api/v1/activation-keys[...]` (list, by-restaurant, :id, generate, revoke, reactivate, bulk-*) | Platform | area `devices` (READ_ONLY, SUPPORT_ADMIN read; OPS write) | list returns live `code` for AVAILABLE keys; `:id` returns raw row |
| `POST /api/v1/activation/redeem` | none (code is the credential) | global 120/min/IP | mints Device + deviceToken; races (LB-02) |
| `GET /api/v1/restaurants/:id/license-certificate` | Platform | area `licensing` (OPS, OWNER, SUPER_ADMIN only) | ECDSA-signed cert from DB tier; audited |
| `/api/v1/plans[...]` | Platform | area `subscriptions` (FINANCE write) | entitlements/limits editable; live, no snapshot |
| `/api/v1/subscriptions[...]` (assign, change-plan, renew, extend, suspend, reactivate) | Platform | area `subscriptions` | no maker/checker |
| `/api/v1/subscriptions/:id/applications[/:appCode]`, `/restaurants/:id/applications` | Platform | subscriptions / restaurants | enabled/deviceQuota/config |
| `/api/v1/applications[...]`, `POST /applications/releases` | Platform | area `ops` | `downloadUrl` unvalidated |
| `/api/v1/invoices[...]` incl. `POST :id/payments`, `PATCH :id/status`, `POST check-renewals` | Platform | area `billing` (FINANCE write) | manual payment recording |
| `GET/POST /api/v1/tenant/billing/*` incl. `POST invoices/:id/pay` | Tenant JWT, NO role check | any tenant user of the restaurant | LB-01 |
| `POST /api/v1/payments/orders`, `GET /payments/:id/status`, `POST /payments/:id/refund` | Device | orders: KIOSK/KIOSK_ADMIN; refund: POS/POS_ADMIN; status: any device | restaurant-scoped via runAsTenant |
| `POST /api/v1/payments/cashfree/webhook` | HMAC signature only, `@SkipThrottle` | n/a | raw body 1 MB |
| `GET /api/v1/payments[/:id]` (platform) | Platform | area `billing` | returns raw providerResponse |
| `GET/POST /api/v1/tenant/payment-connection` | Tenant JWT | OWNER/MANAGER only (in-controller) | KYC |
| `GET/PATCH /api/v1/payment-connections`, `/restaurants/:id/payment-connection[/approve...]` | Platform | area `billing` | masked view |
| `POST /api/v1/tenant/menu-sync` | Device | KIOSK_ADMIN | trusted price source |
| `GET/POST /api/v1/platform/offline-policy/*` | Platform | area `licensing` | signed emergency extensions |
| `POST /api/v1/receipts/send` | Device | KIOSK/KIOSK_ADMIN/POS/POS_ADMIN | SMS/WhatsApp relay |
| `/api/v1/platform/notifications/*` | Platform | area `self` | per-user read state |
| `/api/v1/master-catalog/*` incl. `POST upload-image` | Platform | area `catalog` (write = OWNER/SUPER_ADMIN) | no zod validation |
| `POST/GET /api/v1/tenant/me/backups[/:id/download|/file]` | Tenant JWT, NO role check | any tenant user | LB-06 |
| `POST /api/v1/devices/me/backups` | Device | any device type | LB-06 |
| `GET /api/v1/restaurants/:id/backups[/:bid/download|/file]` | Platform | area `ops` READ (READ_ONLY, SUPPORT_ADMIN) | LB-05 |
| `GET/POST /api/v1/platform/backups[...]` (fleet, storage-health, trigger, verify, preview-restore, restore-jobs/:id/confirm) | Platform | area `ops` | restore = ops write |
| `GET /api/v1/platform/jobs`, `POST /platform/jobs/run` | Platform | area `ops` | global jobs, run as platform |

## Old-audit claim verification

| Old ID | Verdict (CONFIRMED/FIXED/FALSE/UNVERIFIABLE) | Evidence file:line | Note |
|---|---|---|---|
| F-001 | CONFIRMED | `billing/tenant-billing.controller.ts:11,40-48` (only `TenantAuthGuard`, no role); `billing/invoices.service.ts:816-917` (amount `:828`, COMPLETED payment `:832-844`, PAID `:850-862`, sub `ACTIVE`+`expiresAt` `:865-872`); `common/security/session-state.ts:31-33`; real UI caller `pos-admin/src/cloud/cloudClient.ts:608-614`, `SubscriptionPlansView.tsx:186` | Still fully exploitable. No gateway call. Worse than described: also un-suspends a SUSPENDED subscription (LB-01). |
| F-011 | CONFIRMED (race: yes; plaintext: yes, but low) | `activation-keys/activation-keys.service.ts:246-314` (findUnique `:248`, unconditional `update({where:{id}})` `:311-314`, plain `READ COMMITTED` via `prisma.service.ts:76-81`); plaintext `schema.prisma` ActivationKey.code, `service:203-215`, audit `:434,:461` | Race real for both `redeem` and `activateDevice` (LB-02). Plaintext storage real but code is by design shown to operators; downgrade to hardening. Entropy is fine (96-bit CSPRNG, `:15-19`). |
| F-013 | CONFIRMED | `tenant-auth/tenant-auth.service.ts:403-520` has no `maxDevices` lookup at all (compare `activation-keys.service.ts:273-287`); POS_ADMIN accepts any key type `:441-444` | (LB-03). Requires a platform-issued unredeemed key for that restaurant. |
| F-016 | CONFIRMED (narrower than claimed) | `payments/payment-orders.controller.ts:31-36` (device type POS/POS_ADMIN only, no staff identity); `payments.service.ts:124-184` (no audit, `requestedBy` never set, aggregate-then-create not locked `:137-153`) | Refund goes back to the original payer, so it is revenue-loss/fraud-by-collusion, not theft. Over-refund also capped by Cashfree and by `REFUND_PENDING` status gate `:130`. (LB-08) |
| F-017 | CONFIRMED | `payments/cashfree-webhook.controller.ts:10` (`@SkipThrottle`); `payments.service.ts:212-227` writes `INVALID:<uuid>` WebhookEvent with attacker JSON (up to 1 MB, `main.ts:18`) before any auth; no retention job (`jobs.service.ts:56-66`) | Unauthenticated DB growth. (LB-07) |
| F-018 | CONFIRMED at code level; impact bounded (Low) | `master-catalog/master-catalog.service.ts:250-281` (SVG allowed, ext taken from user `fileName` `:265-267`, no magic-byte check, writes into `../super-admin-web/public/...`) | Path traversal is NOT possible (ext starts at last `.`, so cannot contain `..`). Attacker must hold catalog-write (OWNER/SUPER_ADMIN only, `access.ts:45,49`), and whether the file is ever served depends on deployment (UNVERIFIABLE). (LB-11) |
| F-020 | CONFIRMED | `backups/tenant-backups.controller.ts:9-38` (`TenantAuthGuard` only) | Any tenant role can create/list/download backups. (LB-06) |
| F-035 | CONFIRMED | `common/rbac/access.ts:54-57,61-66` (SUPPORT_ADMIN/READ_ONLY `ops:'read'`), `:69` (backups path -> `ops`), `backups/platform-backups.controller.ts:22-37` | GET = read, so read-only roles get presigned URL or the decrypted `/file` (LB-05). |
| F-036 | CONFIRMED (partly fixed) | STAFF gate added: `payments/kiosk-payment-connection.controller.ts:22-24,32-34`. Still unmasked for OWNER/MANAGER: `payments/payment-connections.service.ts:99-136` (`pan,gst,cin,uidai` returned raw); stored plaintext `schema.prisma` RestaurantPaymentConnection `pan/uidai` | Platform view is masked (`:358-380`). Aadhaar/PAN plaintext at rest + returned to MANAGER. (LB-10) |
| F-037 | CONFIRMED | `notifications/receipts.controller.ts:14-24`, `dto/send-receipt.dto.ts:3-9`, `notification-gateway.service.ts:79-101` | Device type limited to KIOSK/POS families (CAPTAIN/KDS excluded); still no order binding, no quota, only global 120/min/IP. (LB-09) |
| F-038 | CONFIRMED for formula injection; header-injection claim FALSE | `reports/reports.service.ts:271-273,292,315` (only quote-wrapped, no `=+-@` neutralising); `reports.controller.ts:50` puts `type` in header but Node's `setHeader` throws on CR/LF (no split), leaving only filename-parameter tampering | Real broader variant: `super-admin-web/src/lib/csvExport.ts:6-12` also has no neutralisation and the Devices export includes `appVersion`, a device-supplied string (`devices/dto/heartbeat.dto.ts:7`). (LB-12) |

## New/independent findings

### LB-01 Any tenant user can mark their own SaaS invoices paid, renew or un-suspend the subscription (F-001)
- Severity: critical (approx. CVSS 4.0 `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N`, financial-integrity impact; reviewer to confirm score) ; Class: CONFIRMED
- CWE/OWASP: CWE-285, CWE-840 (business logic), CWE-639; OWASP API5 (BFLA), API6
- Component + file:line(s): `cloud/api/src/modules/billing/tenant-billing.controller.ts:11,40-48`; `billing/invoices.service.ts:816-917` (esp. `:828` amount, `:832-844` payment row, `:865-872` subscription update); same pattern in platform `recordPayment` `:413-420`
- Attacker / precondition: any authenticated user of a restaurant (STAFF, CASHIER, anyone that can log in; a lapsed restaurant can still log in on purpose, `session-state.ts:31-33`).
- Repro (code-trace): `POST /api/v1/tenant/billing/invoices/<own invoice id>/pay` with `{}` (method defaults `UPI`, amount defaults `invoice.totalAmount`, referenceNumber auto `TXN-UPI-<ts>`). Service inserts a `COMPLETED` Payment, sets invoice `PAID`, then `subscription.update({status:'ACTIVE', expiresAt: invoice.billingPeriodEnd})`. Renewal invoices are auto-created 7 days before expiry (`checkAndGenerateRenewals` `:623-717`) so this repeats forever.
- Expected vs actual: payment state must come only from a verified provider event (Cashfree webhook/server-side status) or a platform finance user; actual: client-asserted.
- Impact: unlimited free service; falsified revenue/collection records (`method: GATEWAY` also accepted, `referenceNumber` free text); also flips `SUSPENDED` (platform action for abuse/non-payment) back to `ACTIVE` because the update forces `status:'ACTIVE'`; can also pay `VOID`/`REFUNDED` invoices (only `PAID` is rejected, `:824`).
- Root cause: endpoint implements "pay" as a database write with no gateway, no role check, no amount bound (`amount` accepted `.positive()` only), no invoice-state check.
- Recommended fix: delete `POST tenant/billing/invoices/:id/pay` (or make it create a Cashfree order and return a payment session); settle invoices only from the verified webhook handler; gate any tenant billing route to OWNER; in the settle path do not touch `SUSPENDED`, reject non-`ISSUED/PAST_DUE` invoices, and compare paid amount to remaining balance.
- Suggested regression test: STAFF token -> `/pay` returns 403/404 and invoice/subscription unchanged; webhook-only settlement test; suspended subscription stays suspended after any payment call.

### LB-02 Activation-key redemption is not atomic: one key yields several devices, device limit is racy, key revocation misses orphaned devices (F-011)
- Severity: medium ; Class: CONFIRMED (code-trace)
- CWE/OWASP: CWE-362, CWE-367; OWASP API6
- Component + file:line(s): `activation-keys/activation-keys.service.ts:246-338` (check `:248-256`, seat count `:279-286`, create `:295-309`, unconditional update `:311-314`); identical in `tenant-auth/tenant-auth.service.ts:403-500` (update at `:485`); tx is default READ COMMITTED (`prisma/prisma.service.ts:76-81`, no row lock, no conditional `updateMany`).
- Attacker / precondition: holder of one valid unredeemed key (a customer with a welcome kit). No other privilege.
- Repro (code-trace): fire N parallel `POST /api/v1/activation/redeem {code, deviceType}`. Every request reads status `ACTIVE`, every request counts the same `activeDeviceCount < maxDevices`, each creates its own `Device` + distinct `deviceToken`, each sets the key `REDEEMED` (last writer wins `redeemedByDeviceId`).
- Expected vs actual: one key = one device; `Plan.maxDevices` is a hard cap. Actual: several live devices per key, and the cap can be overshot by the parallelism factor. Also `revoke` (`:355-362`) only revokes `redeemedByDeviceId` (the last writer), so the other devices from the same key survive revocation.
- Impact: license/seat bypass, un-revocable extra terminals.
- Root cause: read-then-write without an atomic claim.
- Recommended fix: claim the key with `updateMany({where:{id, status:'ACTIVE', expiresAt:{gt:now}}, data:{status:'REDEEMED',...}})` and abort if `count===0`; take a per-restaurant advisory lock (`pg_advisory_xact_lock(hashtext(restaurantId))`) or `SELECT ... FOR UPDATE` on the Subscription row before the seat count; use the same helper from both `redeem` and `activateDevice`.
- Suggested regression test: `Promise.all` of 10 redeems on one key with maxDevices=3 -> exactly 1 success, 9 x 409, device count <= 3.

### LB-03 `activateDevice` ignores `Plan.maxDevices` and lets POS_ADMIN use any key type (F-013)
- Severity: medium ; Class: CONFIRMED
- CWE/OWASP: CWE-841, CWE-284; OWASP API6
- Component + file:line(s): `tenant-auth/tenant-auth.service.ts:403-500` (no plan/seat lookup anywhere; compat check `:441-444` short-circuits for `POS_ADMIN`); contrast `activation-keys.service.ts:273-287`.
- Attacker / precondition: tenant user who can log in and has any unredeemed key for their restaurant (platform issues keys; `generate()` does not check seats, `activation-keys.service.ts:174-237`, so keys can legitimately exceed the cap).
- Repro: login -> `ACTIVATION_REQUIRED` -> `POST /api/v1/tenant/auth/activate-device` with `deviceType:'POS_ADMIN'` and a KIOSK/CAPTAIN key.
- Expected vs actual: same seat cap and key-type binding as `redeem`; actual: neither.
- Impact: seat cap only enforced on one of the two provisioning paths; key type restriction bypass.
- Root cause: duplicated provisioning logic.
- Recommended fix: extract one `provisionDeviceFromKey(tx, key, deviceType)` used by both paths (atomic claim + seat check + entitlement check); drop the POS_ADMIN carve-out or require key type `POS_ADMIN|ANY`.
- Suggested regression test: activate-device at the cap returns 409; POS_ADMIN with a KIOSK-only key returns 400.

### LB-04 READ_ONLY / SUPPORT_ADMIN platform roles can harvest live activation codes and mint device credentials
- Severity: medium ; Class: CONFIRMED (code-trace)
- CWE/OWASP: CWE-200, CWE-269; OWASP API3/API5
- Component + file:line(s): `common/rbac/access.ts:54-66,72` (`/activation-keys` and `/devices` -> area `devices`; READ_ONLY and SUPPORT_ADMIN have `devices:'read'`); `activation-keys.service.ts:44-51,86-90` (AVAILABLE keys return plaintext `code`), `:163-172` + controller `:42-45` (`GET :id` returns the raw row, bypassing `present()` redaction); `:434,:461` (`code` written to audit details on reactivate/delete; `audit` read is granted to READ_ONLY); redeem endpoint is unauthenticated `activation-redeem.controller.ts:15-19`.
- Attacker / precondition: a READ_ONLY (auditor) or SUPPORT_ADMIN platform account, or anyone who can read `GET /api/v1/audit-logs`.
- Repro: `GET /api/v1/activation-keys?lifecycle=AVAILABLE` -> copy a `code` -> `POST /api/v1/activation/redeem {code, deviceType}` (an `ANY` key accepts any device type) -> returns a long-lived `deviceToken` (no expiry, `device-auth.guard.ts`) for that restaurant.
- Expected vs actual: read-only roles must not obtain credentials that confer write/sync access; actual: a bearer credential is one GET away.
- Impact: read-only role -> tenant device access (sync data, order push, refund if POS type, receipts relay), and consumes a licensed seat.
- Root cause: the code is both identifier and bearer secret, shown to every reader of the area.
- Recommended fix: return the plaintext `code` only once in the `generate` response and store a SHA-256 hash (show `codeLast4` afterwards); or at minimum require `devices:write` to see codes; strip `code` from audit details (use `codeLast4`); route `GET :id` through `present()`.
- Suggested regression test: READ_ONLY list/detail/audit contain no redeemable code; redeem with a value taken from those responses fails.

### LB-05 Read-only platform roles can download full restaurant backups (F-035)
- Severity: medium ; Class: CONFIRMED
- CWE/OWASP: CWE-863, CWE-359; OWASP API5
- Component + file:line(s): `access.ts:54-57,61-66,69`; `backups/platform-backups.controller.ts:22-37`; `backups.service.ts:199-222` (presigned URL for unencrypted S3 objects, else server-side decrypt and stream); no audit call on download.
- Attacker / precondition: SUPPORT_ADMIN or READ_ONLY platform account.
- Repro: `GET /api/v1/restaurants/<id>/backups` -> `GET .../backups/<bid>/file` returns the decrypted JSON (branches, user emails/phones, synced entities such as customers, all synced orders, `backups.service.ts:38-61`).
- Impact: bulk PII/financial export by a role meant to be read-only; download is unaudited.
- Root cause: backup download shares the generic `ops` read area.
- Recommended fix: add explicit AREA_RULE for `/backups/:id/(download|file)` requiring owner-level (or a new `backups:download` write-level area); audit every download.
- Suggested regression test: READ_ONLY/SUPPORT_ADMIN get 403 on `/download` and `/file`; audit row written for an allowed download.

### LB-06 Tenant/device backup endpoints have no role or quota control (F-020)
- Severity: medium ; Class: CONFIRMED
- CWE/OWASP: CWE-285, CWE-770; OWASP API5/API4
- Component + file:line(s): `backups/tenant-backups.controller.ts:9-38`; `backups/device-backups.controller.ts:8-17` (any device type); `main.ts:19` (20 MB JSON body); no per-restaurant count/size cap in `backups.service.ts:118-175`; retention only 30 days default (`schema.prisma` Backup.retentionDays).
- Attacker / precondition: any tenant user (STAFF/CASHIER) or any device token (incl. KDS/Captain/Kiosk).
- Repro: STAFF `GET /api/v1/tenant/me/backups`, `GET .../:id/file` downloads the whole backup (terminal-uploaded backups contain the local DB incl. staff PINs, per comment `backups.service.ts:33-37`); repeated `POST` of 20 MB objects (120/min/IP throttle only) fills S3/disk.
- Impact: data exposure to low-privilege staff; storage-cost/disk exhaustion; attacker-authored backup containing `syncedEntities`/`syncedOrders` arrays is treated as restorable in cloud (`backups.service.ts:91-103`) and, once an operator confirms, upserts attacker content into that restaurant's synced data (`:452-478`).
- Root cause: TenantAuthGuard has no role dimension; no quotas.
- Recommended fix: OWNER/MANAGER only for create/list/download; per-restaurant daily count and total-bytes cap; restrict device backups to the device's own type and rate; refuse cloud restore for backups whose `deviceId` is set/tenant-uploaded.
- Suggested regression test: STAFF -> 403 on all four routes; 101st backup in a day -> 429/409.

### LB-07 Cashfree webhook: unauthenticated payloads persisted, unthrottled, no retention; no timestamp freshness (F-017)
- Severity: medium (storage DoS) ; Class: CONFIRMED
- CWE/OWASP: CWE-770, CWE-294; OWASP API4
- Component + file:line(s): `payments/cashfree-webhook.controller.ts:10`; `payments.service.ts:196-227` (both the "secret not configured" and "bad signature" branches persist `rawPayload` of attacker's choosing); `main.ts:18` (1 MB raw); `cashfree-gateway.service.ts:153-162` (HMAC over `timestamp+body`, timestamp not checked for age); no cleanup of `WebhookEvent` in `jobs.service.ts`.
- Attacker / precondition: anonymous network access.
- Repro: loop `POST /api/v1/payments/cashfree/webhook` with any 1 MB JSON and no signature -> one row per request forever (no throttle, no dedup for `INVALID:` keys).
- Expected vs actual: reject before storing; actual: stored. Replay of a captured valid webhook is accepted indefinitely, but replays are neutralised by the dedup key (`:265-278`) and terminal-status check (`:335-339`), so this is hardening only.
- Impact: DB growth/cost, log pollution.
- Root cause: "always record" design applied before authentication.
- Recommended fix: respond 401/400 without writing when signature is invalid (log to app logs with a counter), apply a coarse IP throttle instead of `@SkipThrottle`, reject `x-webhook-timestamp` older than ~5 min, add WebhookEvent retention.
- Suggested regression test: bad-signature POST creates no WebhookEvent row; 1000 bad posts get throttled.

### LB-08 Refunds: device token alone, no staff attribution/audit, non-atomic (F-016)
- Severity: low-medium ; Class: CONFIRMED
- CWE/OWASP: CWE-862, CWE-778, CWE-362; OWASP API5
- Component + file:line(s): `payment-orders.controller.ts:31-36`; `payments.service.ts:124-184` (no `audit.log`, `Refund.requestedBy` never populated, aggregate `:137-153` then insert not locked)
- Attacker / precondition: holder of a POS/POS_ADMIN device token (any cashier at the terminal, or a stolen token; tokens do not expire).
- Repro: `POST /api/v1/payments/<paymentId>/refund {amountPaise, reason}` for any SUCCESS kiosk payment of that restaurant; two concurrent calls both pass the remaining-balance check (Cashfree caps total refund, and `REFUND_PENDING` status `:130,:179-181` narrows but does not close the window).
- Impact: unattributed, unaudited refunds; money returns to the payer so this is collusion/fraud exposure and revenue loss, not theft.
- Root cause: refund authority modelled at device level.
- Recommended fix: require a manager/staff authorisation (tenant JWT with OWNER/MANAGER, or PIN token) and write `requestedBy` + an audit row; wrap balance check + insert in one tx with `FOR UPDATE` on the PaymentTransaction.
- Suggested regression test: refund without manager auth -> 403; concurrent refunds never exceed payment amount; audit row exists.

### LB-09 Receipt relay is unmetered and not bound to an order (F-037)
- Severity: low-medium ; Class: CONFIRMED
- CWE/OWASP: CWE-770, CWE-799; OWASP API4
- Component + file:line(s): `notifications/receipts.controller.ts:14-24`; `dto/send-receipt.dto.ts:3-9` (arbitrary Indian mobile, 10 free-text params x 200 chars); `notification-gateway.service.ts:79-101` (params go into WhatsApp template / MSG91 `VAR1..`)
- Attacker / precondition: KIOSK/KIOSK_ADMIN/POS/POS_ADMIN device token (kiosks are unattended public hardware).
- Impact: platform-owner-paid SMS/WhatsApp spam, phishing text in template variables to arbitrary numbers, reputation/sender-ID risk. Only global 120 req/min per IP applies.
- Recommended fix: require `orderId`, verify it is a PAID order of that restaurant and that the phone equals the order's phone; per-restaurant daily quota; per-recipient cooldown; audit.
- Suggested regression test: send without matching order -> 403; 21st message/day -> 429.

### LB-10 Aadhaar/PAN returned unmasked to OWNER/MANAGER and stored in plaintext (F-036)
- Severity: medium ; Class: CONFIRMED
- CWE/OWASP: CWE-312, CWE-359, CWE-200
- Component + file:line(s): `payments/payment-connections.service.ts:99-136` (`pan, gst, cin, uidai` returned raw); columns plaintext in `schema.prisma` RestaurantPaymentConnection; only the bank account number is AES-GCM encrypted (`:54-56`); DTO does not validate PAN/GSTIN/Aadhaar format (`dto/payment-connection.dto.ts:6-9`).
- Attacker / precondition: a MANAGER (lower than the KYC subject) or anyone holding an OWNER/MANAGER session token/XSS.
- Impact: Aadhaar (UIDAI) exposure in API responses and DB dumps; DPDP/Aadhaar-regulation exposure.
- Root cause: `toOwnView` mirrors the stored row.
- Recommended fix: return masked values (last 4) in `toOwnView` and never re-return Aadhaar; encrypt `pan/uidai/cin` with the existing credential util (or do not persist Aadhaar, forward to Cashfree only); validate formats.
- Suggested regression test: MANAGER GET returns `••••` forms only; DB row for uidai is ciphertext.
- Side note (low, SUSPECTED): resubmit is allowed in `PENDING_VERIFICATION` (`:10,:37`), so a MANAGER can change bank/KYC between the platform's `approve` phase 1 read and phase 3 write (`:171-266`); the row then reads ACTIVE with data Cashfree never received.

### LB-11 Master-catalog image upload trusts client extension and allows SVG (F-018)
- Severity: low (owner-level attacker; serving-dependent) ; Class: CONFIRMED
- CWE/OWASP: CWE-434, CWE-79
- Component + file:line(s): `master-catalog/master-catalog.service.ts:250-281`; controller `:46-52` has no zod validation (also `createItem/updateItem` accept unvalidated JSON, `imageUrl` any string).
- Attacker / precondition: PLATFORM_OWNER / SUPER_ADMIN (only roles with catalog write). Impact is lateral (SUPER_ADMIN -> PLATFORM_OWNER session) only if the upload directory is actually served under the Super Admin origin.
- Repro: `POST /api/v1/master-catalog/upload-image {fileName:"x.html", contentType:"image/png", base64Data:<html>}` -> saved as `dish_<rand>.html`.
- Root cause: content-type not tied to stored extension; SVG allowed; sync `writeFileSync` into a source tree (also breaks in prod builds).
- Recommended fix: derive ext from a whitelist keyed by sniffed magic bytes, drop SVG or sanitise, store in object storage on a separate origin with `Content-Disposition: attachment`/CSP, validate DTOs with zod.
- Suggested regression test: `.html` name or non-image bytes rejected; SVG rejected.

### LB-12 CSV formula injection (server export and client exports) (F-038)
- Severity: low ; Class: CONFIRMED
- CWE/OWASP: CWE-1236
- Component + file:line(s): `reports/reports.service.ts:271-273,292,315` (names quote-wrapped only; `plan.name` not even quote-escaped); `super-admin-web/src/lib/csvExport.ts:6-12`; device-controlled `appVersion` (`devices/dto/heartbeat.dto.ts:7`, and unauthenticated-after-code redeem `activation-key.dto.ts:28`) is exported by `pages/Devices/DevicesListPage.tsx:163`.
- Attacker / precondition: a device token holder (lower trust than platform staff) sets `appVersion` to e.g. `=HYPERLINK(...)`; platform staff exports and opens the Devices CSV in Excel. Server-report variant needs owner-level platform user (restaurant/plan names).
- Impact: spreadsheet formula execution/exfil on a staff workstation (subject to Excel prompts).
- Recommended fix: in both exporters prefix cells beginning with `= + - @ \t \r` with `'`; allowlist `type` for the server export; escape `"` in plan name.
- Suggested regression test: exported cell for `=1+1` is `'=1+1`.

### LB-13 Kiosk payment order idempotency is not bound to the cart
- Severity: medium (business logic) ; Class: SUSPECTED (depends on kiosk/order-sync trusting this API)
- CWE/OWASP: CWE-841, CWE-639
- Component + file:line(s): `payments/payments.service.ts:23-39` (existing order found by `externalOrderId` -> if `PAID` (or attempt in flight) returns it without comparing `dto.lines` to stored `items`).
- Attacker / precondition: KIOSK/KIOSK_ADMIN device token (e.g. tampered kiosk build).
- Repro: pay a cheap order with `externalOrderId=E`; later `POST /payments/orders {externalOrderId:E, lines:<expensive cart>}` -> response reports the already-PAID order/payment as if it covered the new cart. Combined with client-asserted order push (F-014, not my slice) this yields free items.
- Recommended fix: store a canonical cart hash on Order; on replay with a different hash return 409.
- Suggested regression test: same `externalOrderId`, different lines -> 409.

### LB-14 Webhook/refund state machine gaps
- Severity: low ; Class: CONFIRMED (edge cases)
- Component + file:line(s): `payments.service.ts:335-354` (TERMINAL_STATUSES omits `REFUND_PENDING`, `FAILED`, `USER_DROPPED`; a late/duplicate failure webhook can overwrite `paymentTransaction.status` and set `Order.status=PAYMENT_FAILED` even after a successful attempt/refund started); `:404-420` (refund `FAILED` leaves the payment in `REFUND_PENDING` forever and `createRefund` rejects that status `:130`, so a failed refund can never be retried).
- Impact: order/payment state corruption, stuck refunds. No attacker control beyond Cashfree ordering.
- Recommended fix: monotonic transitions (`SUCCESS`/`REFUND_*` never regress; only move `Order` from non-`PAID`); on refund FAILED restore prior status when no other refund is pending; cross-check with `getOrderStatus` for money-moving transitions.

### LB-15 Platform invoice payment recording: overpay, double-record, void invoices, no separation of duties
- Severity: low ; Class: CONFIRMED (integrity) / HARDENING
- Component + file:line(s): `billing/invoices.service.ts:363-454` (only rejects `PAID`; no `amount <= balance`; sums *all* payment rows regardless of status `:393`; concurrent calls both pass `:371` and insert two payments); `:524-566` (`updateStatus` allows PAID->VOID etc.). Same in tenant path `:846`.
- Impact: duplicate/over-payments recorded; VOID/REFUNDED invoices revive subscriptions; a single FINANCE_ADMIN can record payment, void, renew (`subscriptions.service.ts:135-157`) with no second approver (audited).
- Recommended fix: lock the invoice row (`FOR UPDATE`), restrict to `ISSUED/PAST_DUE`, filter `status==='COMPLETED'` when summing, cap at outstanding balance; consider maker-checker for manual payments and renewals.

### LB-16 App-release `downloadUrl` is an unvalidated string surfaced to every terminal
- Severity: low ; Class: CONFIRMED (missing validation)
- CWE/OWASP: CWE-79, CWE-494
- Component + file:line(s): `applications/dto/application.dto.ts:10` (`z.string().optional()`); consumers `packages/ui/src/PlatformNoticeBanner.tsx:36-37` (`<a href target=_blank>`), `packages/sync/src/device_gate.ts:235`.
- Attacker / precondition: platform role with `ops:write` (OPS, SUPER_ADMIN, OWNER) or a compromised such session.
- Impact: `javascript:` / arbitrary-host link pushed to every POS/KDS/Kiosk banner; no integrity hash/signature on the advertised installer.
- Recommended fix: `z.string().url()` restricted to `https:` and an allowlisted host; add `sha256` + signature for installers.

### LB-17 Plan limits and feature flags are only partly enforced server-side
- Severity: low (business logic; no boundary broken by an external attacker) ; Class: CONFIRMED
- Component + file:line(s):
  - `maxUsers` enforced nowhere (`grep maxUsers` only DTO/tenant-auth limits `tenant-auth.service.ts:630`); `ApplicationEntitlement.deviceQuota` stored (`application-entitlements.service.ts:100-104`) but never checked.
  - `Plan.entitlements` (21 feature booleans) are consumed only by the client (`tenant-auth.service.ts:600-635`, signed certificate `licensing.service.ts:86-95`) and by ai-assistant/qr-ordering; `EntitlementGuard` (`common/guards/entitlement.guard.ts`) is defined but applied to no route. Server-side enforcement exists only for the six AppCodes (`device-auth.guard.ts:98-105`), subscription state, and `maxBranches`/`maxDevices`.
  - No feature snapshot: editing a Plan (`plans.service.ts:70-85`, FINANCE_ADMIN can) changes every subscriber immediately; `changePlan` does not check plan `status`, does not re-check seats/branches after a downgrade (`subscriptions.service.ts:90-118`).
  - Status-set mismatch: `redeem` counts seats only for `ACTIVE/TRIAL` (`activation-keys.service.ts:273-277`) while `assertAppEnabled` accepts `PAST_DUE` (`application-entitlements.service.ts:135`), so a PAST_DUE-only restaurant redeems with **no** seat check; two concurrent `assign` calls can create two active subscriptions (no partial unique index).
- Recommended fix: enforce feature flags at the API for the features that matter (or accept and document client-side trust), snapshot entitlements into the Subscription at assign/renew, unify the "current subscription" query used by guard/redeem/entitlement service.

### LB-18 Offline license certificate is transferable and un-revocable
- Severity: low ; Class: HARDENING
- Component + file:line(s): `packages/business/src/license_certificate.ts:108-136` (`expectedRestaurantId` optional; both callers omit it: `pos/src/components/settings/PosSettingsView.tsx:194`, `pos-admin/.../SubscriptionPlansView.tsx:288`); certificate lifetime = subscription expiry (`licensing.service.ts:89`), no device binding; `offline-policy.service.ts:190-208` revocation only flips a DB row while the signed extension certificate stays valid on devices already holding it.
- Impact: a cert (or extension cert) leaked from one restaurant can be applied at another install or after suspension until expiry; local license enforcement is client-side anyway.
- Recommended fix: pass the installed restaurantId to `applyLicenseCertificate`; short cert validity + refresh; signed revocation list.

### LB-19 Restore executes production restore for a "STAGING_PREVIEW" job
- Severity: low ; Class: CONFIRMED (logic)
- Component + file:line(s): `backups/backups.service.ts:377-419` stores `targetType`; `:421-502` `executeRestore` never reads it and always upserts into the live restaurant.
- Impact: an operator confirming a staging preview overwrites live synced data (needs `ops:write`).
- Recommended fix: branch on `job.targetType`; refuse PRODUCTION unless owner-level and the job says so.

### LB-20 Backup/notification hardening items
- Severity: info/low ; Class: HARDENING
- Backup encryption is optional even in production (`config/env.validation.ts:41-48`; `backup-storage.service.ts:44-51,169-175`): unencrypted S3 objects can be handed out via 5-minute presigned URLs; downloads are never audited (`backups.service.ts:199-222`).
- Email templates interpolate names/tokens unescaped into HTML (`notifications/email-templates.ts`, e.g. `${params.fullName}` in password-reset mail): HTML/link injection into staff-received mail by whoever sets a user's `fullName` (tenant OWNER).
- `POST /platform/jobs/run` and `snapshotStaleRestaurants` build whole-restaurant snapshots in memory (`backups.service.ts:38-61,320-343`, 50 per pass): heap pressure on the single API process for large tenants.
- Platform payment detail returns raw `providerResponse` webhook JSON (`platform-payments.service.ts:41-49`) to every role with `billing:read`, which may include payer UPI/card metadata.

## Controls verified OK (things you checked that are sound; one line each with file:line)
- Activation code: 96-bit CSPRNG (`activation-keys.service.ts:15-19`), unique constraint + collision retry (`:200-235`); brute force infeasible (also throttled).
- Device credential: 256-bit random token, only SHA-256 stored (`token.util.ts`, `activation-keys.service.ts:293,307`); shown once.
- Generate validates restaurant/branch/subscription ownership and app entitlement (`:176-197`).
- Expiry enforced by date at redeem, not only status (`:253`); revoke cascades to the device and its refresh tokens (`:355-362`).
- `DeviceAuthGuard` re-checks device status, restaurant status, live subscription (`expiresAt > now`), per-app entitlement, branch and MDM lock on every device request (`device-auth.guard.ts:71-125`).
- Platform RBAC is deny-by-default; URL case tricks yield `null` area -> owner-only (`platform-auth.guard.ts:66-72`, `access.ts:99-104`).
- Cashfree webhook: HMAC-SHA256 over exact raw bytes, `timingSafeEqual` (`cashfree-gateway.service.ts:153-162`, `main.ts:18`); amount and currency compared to the stored transaction (`payments.service.ts:326-333`); dedup key + terminal-status check give replay/idempotency for success; status only changed by webhook, refund sync response is informational (`:168-172`).
- Kiosk cart priced server-side from `MenuSnapshotItem` with modifier validation; client cannot send amounts (`create-payment-order.dto.ts`, `pricing.util.ts:55-98`); payment order creation limited to KIOSK types (`payment-orders.controller.ts:18`).
- Payment lookups scoped by restaurant via `runAsTenant` + `restaurantId` filter (`payments.service.ts:117-126`); tenant invoice/receipt reads scoped (`invoices.service.ts:788,921-925`).
- Settlement account number AES-256-GCM encrypted and never returned; platform view masked (`payment-connections.service.ts:54-56,116-118,347-380`); payment-connection routes now OWNER/MANAGER only (`kiosk-payment-connection.controller.ts:22-34`).
- Cashfree base URL fixed by env (no SSRF) (`cashfree-gateway.service.ts:84-88`); vendor id derived from UUID.
- License certificate: tier/entitlements read from DB, ECDSA P-256 signed server-side, `kid` support (`licensing.service.ts:57-97`); private key only from env.
- Backups: local path traversal guarded (`backup-storage.service.ts:118-123`); storage key server-generated from DB UUID; AES-256-GCM with tag verification (`:126-140`); snapshot excludes password hashes/tokens/device credentials (`backups.service.ts:42-48`); tenant reads scoped by RLS context and `restaurantId` (`:200-202,210-212`); restore job claim is atomic (`:441-445`) and takes a safety snapshot first.
- Upload-image: extension cannot contain `..` (derived from last `.`), so no path traversal out of the upload dir (`master-catalog.service.ts:265-278`).
- Invoice/receipt numbers use an atomic upsert counter (`invoices.service.ts:102-121`); `updateStatus(PAID)` requires completed payments >= total (`:529-536`).
- Raw SQL in slice uses `Prisma.sql` parameters (e.g. `activation-keys.service.ts:115-135`, `invoices.service.ts:191-211`, `backups.service.ts:297-301`); user `q` is bound, not concatenated.
- Platform notifications: per-user audience and read-state (`platform-notifications.service.ts:113-131`).
- Jobs run as platform by design (no tenant input), idempotent, single-flight per instance (`jobs.service.ts:88-110`); trigger requires `ops` write (`access.ts:77`).

## Not verified / limits
- No runtime reproduction: the redemption/refund/invoice races (LB-02, LB-08, LB-15) are code-traced against Postgres READ COMMITTED semantics; `$transaction` is called without an isolation level (`prisma.service.ts:76-81`).
- RLS policies in migrations were not read; conclusions on tenant isolation rely on the `runAsTenant`/`runAsPlatform` wrappers plus explicit `restaurantId` filters. Note `DeviceAuthGuard` and billing use `runAsPlatform` then filter in code.
- Whether super-admin-web `public/assets/uploads/catalog` is publicly served in production (LB-11), real Cashfree behaviour for over-refund/duplicate refund, actual env values (backup encryption key, webhook secret set in prod), reverse-proxy IP handling for the throttler, and how the kiosk client uses payment status vs order-sync (LB-13) are UNVERIFIABLE from source.
- Not audited: tenant-auth (beyond `activateDevice`), support impersonation minting, entity/order sync, ai-assistant, qr-ordering, platform-settings, devices module, super-admin-web beyond CSV export.
