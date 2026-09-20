# REMEDIATION ROADMAP — Jamanvaar Security Remediation

**Remediation Rule:** No application source code has been modified during this audit. All items below are prioritized recommendations requiring explicit approval before implementation.

---

## Phase P0 — Immediate Containment & Hotfixes (Priority: Immediate)

| Priority | Finding IDs | Affected Component | Required Code & Architecture Changes | Required Regression Test | Risk of Change | Verification Method |
|:---:|---|---|---|---|:---:|---|
| **P0-1** | **F-001** | `cloud/api/src/modules/billing/tenant-billing.controller.ts`, `invoices.service.ts` | Remove client-asserted payment settlement in `processTenantPayment`. Status transition to `PAID` and subscription renewal must strictly require Cashfree webhook signature verification. Restrict endpoint to `OWNER` role and use it solely to initiate gateway payment checkout sessions. | Assert that calling `POST /api/v1/tenant/billing/invoices/:id/pay` with arbitrary body returns 400/403 and leaves invoice status `ISSUED` and subscription expiration unchanged. | Minimal (disables fraudulent bypass). | Unit & e2e test with synthetic unpaid invoice. |
| **P0-2** | **F-004, F-005** | `cloud/api/src/modules/support/support.service.ts` | Add explicit `select` projection to `support.service.ts:search` queries on `User`, `Device`, and `ActivationKey`. Exclude `passwordHash`, `activationTokenHash`, `deviceTokenHash`, and `code`. Remove `activationToken` from `resendInvite` response body. | Response payload shape assertion verifying absence of hash fields and activation codes for all roles. | Low. UI consumes only public fields. | Inspect JSON response of `GET /api/v1/support/search?q=test`. |
| **P0-3** | **F-002, F-033** | `tooling/local-runtime/`, POS Sidecar | Bind `standalone_local_core.cjs` to `127.0.0.1` by default. Remove committed `.local_service_key` from version control and rotate the key. Exclude `JamanvaarLocalCore.exe` from git tracking. | Assert that unauthenticated external LAN requests to `http://<ip>:5178/api/orders` are rejected or refused connection. | High for LAN mesh sync (requires terminal pairing). | Probe local port 5178 from secondary network interface. |
| **P0-4** | **F-003** | `cloud/api/src/modules/sync-observability/sync-observability.controller.ts` | Apply `@UseGuards(DeviceAuthGuard)` to `POST /api/v1/platform/telemetry/events`. Derive `restaurantId` and `deviceId` strictly from the validated device token. | Assert unauthenticated POST returns 401 Unauthorized. | Low. Active devices already hold device tokens. | Integration test verifying 401 on anonymous request. |
| **P0-5** | **F-006** | `packages/database/src/live_db.json`, installer scripts | Untrack `live_db.json` from git. Enforce mandatory PIN change and admin credential initialization during first launch. | Verify `live_db.json` is in `.gitignore` and `git ls-files` reports no tracked file. | Low. Clean seed is created on fresh boot. | `git ls-files packages/database/src/live_db.json`. |
| **P0-6** | **F-025, F-046** | `cloud/api/package.json`, `.env` | Set `NODE_ENV=production` explicitly in `start:prod`. Require connection via a dedicated non-superuser PostgreSQL role (`jamanvaar_app`) without `BYPASSRLS`. Fail server startup if superuser connects in production. | Assert startup throws fatal error when connected as `postgres` with `NODE_ENV=production`. | Low. Standard production hardening. | Run `npm run start:prod` and check log output. |

---

## Phase P1 — Critical Security Fixes (Priority: High)

| Priority | Finding IDs | Affected Component | Required Code & Architecture Changes | Required Regression Test | Risk of Change | Verification Method |
|:---:|---|---|---|---|:---:|---|
| **P1-1** | **F-014, F-015, F-007** | `cloud/api/src/modules/order-sync/`, `entity-sync/`, `repositories.ts` | 1. Recalculate order line totals and taxes server-side using current menu pricing snapshot.<br>2. Restrict entity-sync endpoints by `device.type` (`CUSTOMER` access limited to `POS` and `POS_ADMIN`).<br>3. Make QR table token mandatory in `repositories.ts:validateQrTableAccess`. | Push order with manipulated price and assert server overrides with database price. Assert Kiosk token cannot fetch customer entities. | Medium. Requires local offline terminals to push item IDs and quantities rather than pre-summed totals. | Send tampered order payload and verify cloud database record. |
| **P1-2** | **F-016, F-017** | `cloud/api/src/modules/payments/` | 1. Require staff authorization PIN/token for `POST /api/v1/payments/:id/refund`.<br>2. Execute refund balance check inside a `SELECT ... FOR UPDATE` database transaction.<br>3. Reject invalid webhook signatures immediately with 400 without persisting payload to PostgreSQL. | Run concurrent refund test with two simultaneous requests; assert only one succeeds. Send invalid webhook; verify zero rows created in `WebhookEvent`. | Low to Medium. Refund UI must prompt for staff PIN. | Automated concurrency test script. |
| **P1-3** | **F-010, F-011, F-013** | `cloud/api/src/modules/activation-keys/`, `tenant-auth/` | 1. Store activation key codes as SHA-256 hashes.<br>2. Execute redemption using an atomic conditional query (`UPDATE "ActivationKey" SET status='REDEEMED' WHERE code_hash=:hash AND status='ACTIVE'`).<br>3. Enforce `Plan.maxDevices` in `tenant-auth.service.ts:activateDevice`.<br>4. Require `deviceToken` whenever `deviceId` is provided in tenant login. | Concurrent redemption test asserting only one device activates. Assert `activateDevice` rejects when plan device limit is reached. | Medium (database migration required to hash existing unredeemed keys). | End-to-end device activation suite. |
| **P1-4** | **F-018** | `cloud/api/src/modules/master-catalog/` | 1. Disallow `.svg` and `.html` file types.<br>2. Validate MIME types using magic-byte inspection.<br>3. Derive file extension strictly from detected MIME type, ignoring client `fileName`.<br>4. Store uploads in S3 object storage on an isolated CDN domain. | Upload `.svg` and `.html` files; assert 400 BadRequest. | Low. Dish catalog only requires JPEG/PNG/WebP. | Unit test with disguised payload. |
| **P1-5** | **F-028, F-029** | `apps/*/src-tauri/` | 1. Restrict `send_escpos_bytes` to whitelisted printer IP addresses.<br>2. Set strict Content Security Policy (`CSP`) in `tauri.conf.json`.<br>3. Authenticate UDP discovery beacons or validate source socket address. | Assert calling `send_escpos_bytes` to an unwhitelisted IP returns an error. | Medium (printer configuration UI must register allowed printer IPs). | Tauri command execution test. |

---

## Phase P2 — High-Priority Access Control & Session Hardening

| Finding IDs | Affected Area | Remediation Summary |
|---|---|---|
| **F-020** | `cloud/api/src/modules/backups/tenant-backups.controller.ts` | Apply `@Roles('OWNER', 'MANAGER')` to prevent low-privileged `STAFF` from downloading database backups. |
| **F-021** | `cloud/api/src/modules/owners/` | Enforce 10-character password policy, check `user.role === 'OWNER'`, and invalidate active refresh tokens upon password reset. |
| **F-022** | `cloud/super-admin-web/src/pages/restaurants/RestaurantDetailPage.tsx` | Transmit support impersonation credentials via `window.postMessage` or short-lived one-time code rather than URL query parameters. |
| **F-023** | `cloud/api/src/common/guards/*-auth.guard.ts` | Explicitly specify `algorithms: ['HS256']` in `jwt.verifyAsync`. Configure separate secrets (`PLATFORM_JWT_SECRET` and `TENANT_JWT_SECRET`). |
| **F-024** | `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` | Implement account-based login lockout (e.g. 5 failed attempts per 15 minutes), constant-time dummy password hashing, and cap candidate evaluations. |
| **F-012** | `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts` | Perform refresh token validation and revocation in a single database transaction; invalidate all user tokens if an already-revoked token is presented. |
| **F-030** | `packages/database/src/pin.ts` | Upgrade staff PIN hashing from 32-bit FNV-1a to Argon2id / PBKDF2 with salt. |
| **F-008** | `packages/database/src/db.ts` | Cryptographically verify license certificates (`license_certificate.ts`) before applying updates from sync peers. |
| **F-035, F-036** | `cloud/api/src/modules/backups/`, `payments/` | Restrict backup download permissions to `PLATFORM_OWNER` and `SUPER_ADMIN`. Mask Aadhaar (`uidai`) and PAN numbers in API responses. |
| **F-037** | `cloud/api/src/modules/notifications/receipts.controller.ts` | Link receipt sending to an active paid order ID and enforce per-restaurant daily message rate limits. |

---

## Phase P3 — Medium & Low Priority Hardening

- **F-038:** Sanitize CSV exports by prefixing formula triggers (`=`, `+`, `-`, `@`) with a single quote `'`; validate the `type` parameter against an allowlist.
- **F-039:** Exclude passwords and activation tokens from `localStorage` draft saving in `OnboardRestaurantPage.tsx`.
- **F-040:** Reduce default JSON body parser limit in `main.ts` from 20 MB to 1 MB and cap list query pagination.
- **F-041:** Return uniform responses on `GET /api/v1/platform-users/activation-status` to eliminate user enumeration.
- **F-042:** Remove default hardcoded staff PIN `1234` from `captainStore.ts`.
- **F-034:** Remove code from installer scripts that imports self-signed certificates into `Cert:\CurrentUser\Root`.

---

## Phase P4 — Long-Term Architecture & Quality Assurance

- **F-043:** Implement full branch-level multi-tenancy in cloud synchronization and reporting services (`branchId` enforcement).
- **F-043:** Add PostgreSQL migrations to enable Row-Level Security across all 19 operational tables currently lacking RLS.
- **F-044:** Remove dead `EntitlementGuard` code.
- **F-045:** Synchronize architecture documentation with runtime implementation.
- **F-047:** Implement CI/CD automated pipeline with dependency auditing, secret scanning, and reproducible builds.
