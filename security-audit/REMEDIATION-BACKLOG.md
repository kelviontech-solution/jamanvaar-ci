# REMEDIATION BACKLOG — Engineering Task Checklist

This backlog converts confirmed audit findings into actionable development tasks suitable for sprint planning and ticketing systems (Jira / GitHub Issues).

---

## P0 — Immediate Containment & Hotfixes (Week 1)

- [ ] **TASK-P0-01 (F-001): Fix Insecure Tenant Invoice Settlement & Subscription Renewal**
  - **Files:** `cloud/api/src/modules/billing/tenant-billing.controller.ts`, `invoices.service.ts`
  - **Action:** Remove client-controlled status updates in `processTenantPayment`. Status changes to `PAID` must be triggered exclusively by validated Cashfree webhook callbacks or server-side gateway transaction queries. Restrict controller route to `@Roles('OWNER')`.
  - **Acceptance Criteria:** Sending `POST /api/v1/tenant/billing/invoices/:id/pay` with arbitrary values cannot change invoice status or subscription expiration.

- [ ] **TASK-P0-02 (F-004, F-005): Redact Password Hashes & Secrets from Support Search**
  - **Files:** `cloud/api/src/modules/support/support.service.ts`
  - **Action:** Add explicit `select` statements to Prisma queries in `search()`. Exclude `passwordHash`, `activationTokenHash`, `deviceTokenHash`, and plaintext `ActivationKey.code`. In `resendInvite()`, remove `activationToken` from the return object and send only via email.
  - **Acceptance Criteria:** `GET /api/v1/support/search?q=test` returns zero password hashes or activation codes.

- [ ] **TASK-P0-03 (F-002, F-033): Harden Local Core LAN Runtime & Revoke Committed Key**
  - **Files:** `tooling/local-runtime/standalone_local_core.cjs`, `tooling/local-runtime/.local_service_key`
  - **Action:** Bind `standalone_local_core.cjs` to `127.0.0.1` by default. Remove `.local_service_key` from git and rotate the secret. Exclude `JamanvaarLocalCore.exe` from git tracking.
  - **Acceptance Criteria:** Unauthenticated external requests to port 5178 are blocked. No secret keys remain in repository tracking.

- [ ] **TASK-P0-04 (F-003): Authenticate Device Telemetry Endpoint**
  - **Files:** `cloud/api/src/modules/sync-observability/sync-observability.controller.ts`
  - **Action:** Add `@UseGuards(DeviceAuthGuard)` to `POST /api/v1/platform/telemetry/events`. Bind `restaurantId` and `deviceId` to the authenticated device token.
  - **Acceptance Criteria:** Anonymous POST returns 401 Unauthorized.

- [ ] **TASK-P0-05 (F-006): Untrack `live_db.json` & Enforce Initial Password Setup**
  - **Files:** `packages/database/src/live_db.json`, `.gitignore`
  - **Action:** Run `git rm --cached packages/database/src/live_db.json`. Force terminal first-run wizard to require setting unique staff PINs.
  - **Acceptance Criteria:** No demo passwords or customer data exist in version control.

- [ ] **TASK-P0-06 (F-025, F-046): Enforce Production Environment & Non-Superuser Role**
  - **Files:** `cloud/api/package.json`, `cloud/api/src/prisma/prisma.service.ts`, `.env`
  - **Action:** Configure `start:prod` to set `NODE_ENV=production`. Connect API via non-superuser database role `jamanvaar_app`. Fail startup if superuser connects in production.
  - **Acceptance Criteria:** Starting server without `NODE_ENV=production` or with superuser role raises fatal exception.

---

## P1 — Critical Security Features (Week 2–3)

- [ ] **TASK-P1-01 (F-014, F-026): Server-Side Order Repricing on Sync**
  - **Files:** `cloud/api/src/modules/order-sync/order-sync.service.ts`, `local_service.cjs`
  - **Action:** Re-price pushed order line items against the database menu price snapshot. Recalculate taxes and subtotal on server. Discard client-asserted payment status flags.
  - **Acceptance Criteria:** Tampered client prices are overridden by server price rules.

- [ ] **TASK-P1-02 (F-015): Enforce Device-Type Permissions in Entity Sync**
  - **Files:** `cloud/api/src/modules/entity-sync/entity-sync.controller.ts`
  - **Action:** Restrict `CUSTOMER` entity retrieval strictly to `POS` and `POS_ADMIN` device types. Reject requests from `KIOSK` or `KDS`.
  - **Acceptance Criteria:** Kiosk token calling `GET /api/v1/entity-sync/CUSTOMER` receives 403 Forbidden.

- [ ] **TASK-P1-03 (F-016): Authorize Refunds with Staff PIN & Atomic Balance Lock**
  - **Files:** `cloud/api/src/modules/payments/payment-orders.controller.ts`, `payments.service.ts`
  - **Action:** Require a staff manager PIN token for refund requests. Wrap refund balance aggregation and refund record creation inside a single `SELECT ... FOR UPDATE` transaction.
  - **Acceptance Criteria:** POS device token alone cannot issue refunds; concurrent refund requests cannot exceed transaction amount.

- [ ] **TASK-P1-04 (F-017): Webhook Rate Limiting & Early Rejection**
  - **Files:** `cloud/api/src/modules/payments/cashfree-webhook.controller.ts`, `payments.service.ts`
  - **Action:** Validate HMAC signature before database access. Reject invalid signatures immediately with 400. Enforce edge/IP rate limits.
  - **Acceptance Criteria:** Invalid webhook requests create zero rows in `WebhookEvent`.

- [ ] **TASK-P1-05 (F-010, F-011, F-013): Atomic Device Activation & Quota Enforcement**
  - **Files:** `cloud/api/src/modules/activation-keys/activation-keys.service.ts`, `tenant-auth.service.ts`
  - **Action:** Store activation codes as SHA-256 hashes. Use atomic conditional updates (`UPDATE ... WHERE code_hash=:hash AND status='ACTIVE'`). Enforce `Plan.maxDevices` in `activateDevice`. Require `deviceToken` on login whenever `deviceId` is provided.
  - **Acceptance Criteria:** Concurrent redemption of one key allows only one device. Device limit cannot be exceeded.

- [ ] **TASK-P1-06 (F-018): Sanitize File Uploads in Master Catalog**
  - **Files:** `cloud/api/src/modules/master-catalog/master-catalog.service.ts`
  - **Action:** Disallow SVG and HTML. Validate magic bytes for JPEG/PNG/WebP. Derive extension from MIME type. Store files in S3 under a separate CDN domain.
  - **Acceptance Criteria:** Uploading `.svg` or disguised HTML returns 400 Bad Request.

- [ ] **TASK-P1-07 (F-028, F-029): Harden Tauri Desktop Shell & UDP Discovery**
  - **Files:** `apps/*/src-tauri/tauri.conf.json`, `apps/restaurant-system/pos/src-tauri/src/main.rs`, `kiosk-user/src-tauri/src/main.rs`
  - **Action:** Define strict Content Security Policy (`default-src 'self'`). Restrict `send_escpos_bytes` to whitelisted printer IPs. Authenticate UDP discovery beacon packets.
  - **Acceptance Criteria:** Webview cannot connect to non-printer TCP destinations. Kiosk connects only to verified Local Core hosts.

---

## P2 — High-Priority Access Control & Session Hardening (Week 4)

- [ ] **TASK-P2-01 (F-020):** Add `@Roles('OWNER', 'MANAGER')` to `TenantBackupsController`.
- [ ] **TASK-P2-02 (F-021):** Enforce 10-character password policy, check `role === 'OWNER'`, and revoke refresh tokens on owner password reset.
- [ ] **TASK-P2-03 (F-022):** Transmit support impersonation tokens via `postMessage` or one-time code rather than URL query strings.
- [ ] **TASK-P2-04 (F-023):** Pin `algorithms: ['HS256']` in `jwt.verifyAsync` and separate platform and tenant JWT secret keys.
- [ ] **TASK-P2-05 (F-024):** Implement distributed login lockout and constant-time dummy hashing for missing users.
- [ ] **TASK-P2-06 (F-012):** Wrap refresh token rotation in a single locking transaction and implement token family invalidation.
- [ ] **TASK-P2-07 (F-030):** Upgrade staff PIN hashing from 32-bit FNV-1a to Argon2id / PBKDF2 with salt.
- [ ] **TASK-P2-08 (F-008):** Cryptographically verify license certificates before applying sync payloads in `db.ts`.
- [ ] **TASK-P2-09 (F-035, F-036):** Restrict backup downloads to Super Admin; mask Aadhaar (`uidai`) and PAN numbers in tenant views.
- [ ] **TASK-P2-10 (F-037):** Link receipt sending to verified order IDs and enforce per-restaurant message quotas.

---

## P3 & P4 — Hardening & Operational Excellence

- [ ] **TASK-P3-01 (F-038):** Sanitize CSV exports by prefixing `= + - @` with `'` and validate `type` query parameters.
- [ ] **TASK-P3-02 (F-039):** Exclude initial passwords and activation tokens from onboarding wizard `localStorage` drafts.
- [ ] **TASK-P3-03 (F-040):** Reduce default JSON body parser limit to 1 MB and cap list pagination.
- [ ] **TASK-P3-04 (F-041):** Return uniform responses on public activation status checks to eliminate user enumeration.
- [ ] **TASK-P3-05 (F-042):** Remove hardcoded demo PIN `1234` from `captainStore.ts`.
- [ ] **TASK-P3-06 (F-034):** Remove self-signed certificate installation to `Cert:\CurrentUser\Root` in installer scripts.
- [ ] **TASK-P4-01 (F-043):** Implement branch-level multi-tenancy in sync services and add PostgreSQL RLS to all remaining 19 tables.
- [ ] **TASK-P4-02 (F-044):** Remove dead `EntitlementGuard` code.
- [ ] **TASK-P4-03 (F-047):** Set up automated CI pipeline with dependency vulnerability audits and secret scanning.
