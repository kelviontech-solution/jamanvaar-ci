# FINDINGS — Jamanvaar Full Ecosystem Security Audit

**Status:** Completed Static Source Review & Code-Level Verification.  
**Commit Reference:** `d89777c` + active repository working tree.  
**Rules Enforced:** Read-Only Audit Mode. No secrets or production credentials printed.

---

## Findings Matrix

| Finding ID | Title | Severity | Confidence | Affected Area / Service | Status |
|---|---|:---:|:---:|---|:---:|
| **F-001** | Tenant Invoice Payment & Subscription Renewal Bypass | **Critical** | Confirmed | Cloud API (`billing/tenant-billing`) | Confirmed Exploitable |
| **F-002** | LAN Local Core Unauthenticated Server (0.0.0.0, CORS `*`) | **High** | Confirmed | Tooling / POS Sidecar (`standalone_local_core.cjs`) | Confirmed Exploitable |
| **F-003** | Unauthenticated Telemetry Event Injection into Platform Table | **Medium** | Confirmed | Cloud API (`sync-observability`) | Confirmed Exploitable |
| **F-004** | Excessive Credential & Secret Exposure in Support Search | **High** | Confirmed | Cloud API (`support/support.service.ts`) | Confirmed Weakness |
| **F-005** | Support `resendInvite` Returns Plaintext Activation Token | **Medium** | Confirmed | Cloud API (`support/support.service.ts`) | Confirmed Weakness |
| **F-006** | Tracked `live_db.json` Contains Unhashed Staff PINs & Demo PII | **High** | Confirmed | Packages (`database/src/live_db.json`) | Confirmed Weakness |
| **F-007** | QR Table Token Validation Bypass & Client-Side Pricing | **High** | Confirmed | Packages / Pos-Admin (`repositories.ts`, `GuestQrOrderingPage`) | Confirmed Exploitable |
| **F-008** | Client Database Blindly Overwrites Users, Roles & License from Sync | **High** | Confirmed | Packages (`database/src/db.ts`) | Confirmed Weakness |
| **F-009** | Local Core Pairing Endpoint Lacks Rate Limiting (Brute-Forceable PIN) | **Medium** | Confirmed | Tooling (`local_service.cjs`) | Confirmed Exploitable |
| **F-010** | Tenant Login Bypasses Device Token Check When `deviceId` Provided | **Medium** | Confirmed | Cloud API (`tenant-auth/tenant-auth.service.ts`) | Confirmed Exploitable |
| **F-011** | Activation Key Redemption Race Condition & Plaintext Code Storage | **High** | Confirmed | Cloud API (`activation-keys.service.ts`) | Confirmed Weakness |
| **F-012** | Refresh Token Rotation Non-Atomic & Lacks Family Revocation | **Medium** | Confirmed | Cloud API (`tenant-auth/tenant-auth.service.ts`) | Confirmed Weakness |
| **F-013** | Device Activation Bypasses `Plan.maxDevices` Limit | **High** | Confirmed | Cloud API (`tenant-auth/tenant-auth.service.ts`) | Confirmed Exploitable |
| **F-014** | Order Sync Trusts Client Totals Without Server-Side Repricing | **High** | Confirmed | Cloud API (`order-sync/order-sync.service.ts`) | Confirmed Exploitable |
| **F-015** | Entity Sync Permits Any Device Type to Pull Customer PII | **High** | Confirmed | Cloud API (`entity-sync/entity-sync.controller.ts`) | Confirmed Exploitable |
| **F-016** | Refunds Initiated by Device Token Alone Without Staff Authentication | **High** | Confirmed | Cloud API (`payments/payment-orders.controller.ts`) | Confirmed Weakness |
| **F-017** | Cashfree Webhook Persists Unauthenticated Payloads Without Rate Limit | **Medium** | Confirmed | Cloud API (`payments/cashfree-webhook.controller.ts`) | Confirmed Weakness |
| **F-018** | Stored XSS via File Upload in Master Menu Catalog | **High** | Confirmed | Cloud API (`master-catalog/master-catalog.service.ts`) | Confirmed Exploitable |
| **F-019** | Device Bearer Token Non-Expiring, Non-Rotating in `localStorage` | **Medium** | Confirmed | Cloud API & Clients (`device-auth.guard.ts`, `cloudClient.ts`) | Confirmed Weakness |
| **F-020** | Tenant Backup Endpoints Lack Role-Based Authorization Guards | **Medium** | Confirmed | Cloud API (`backups/tenant-backups.controller.ts`) | Confirmed Weakness |
| **F-021** | Owner Password Reset Accepts Weak Passwords & Ignores Target Role | **Medium** | Confirmed | Cloud API (`owners/owners.service.ts`, `owners.controller.ts`) | Confirmed Weakness |
| **F-022** | Support Impersonation Access Token Leaked in URL Query String | **Medium** | Confirmed | Super Admin (`RestaurantDetailPage.tsx:537`) | Confirmed Weakness |
| **F-023** | JWT Verification Does Not Pin Algorithm & Shares Secret Across Realms | **Medium** | Confirmed | Cloud API (`platform-auth.guard.ts`, `tenant-auth.guard.ts`) | Confirmed Weakness |
| **F-024** | Missing Account Lockout, In-Memory Throttler & Timing Attack Oracle | **Medium** | Confirmed | Cloud API (`tenant-auth.service.ts`, `app.module.ts`) | Confirmed Weakness |
| **F-025** | Production Security Posture Depends on Unenforced `NODE_ENV` | **Medium** | Confirmed | Cloud API (`prisma.service.ts`, `package.json`) | Confirmed Weakness |
| **F-026** | Local Core Trusts Client-Supplied Prices, Statuses & Discounts | **High** | Confirmed | Tooling (`local_service.cjs:298-604`) | Confirmed Exploitable |
| **F-027** | Local Core `/api/sync` Broadcasts Full Store Over Unauthenticated SSE | **High** | Confirmed | Tooling (`local_service.cjs:607-647`) | Confirmed Weakness |
| **F-028** | Tauri Shell Arbitrary TCP Socket Command with `csp: null` | **High** | Confirmed | POS Terminal (`main.rs:65-81`, `tauri.conf.json`) | Confirmed Exploitable |
| **F-029** | Kiosk Connects to Untrusted Host Defined in UDP Beacon Payload | **Medium** | Confirmed | Kiosk User (`main.rs:24-60`) | Confirmed Weakness |
| **F-030** | Insecure Staff PIN Hashing via Fast 32-bit FNV-1a Algorithm | **High** | Confirmed | Packages (`database/src/pin.ts`) | Confirmed Weakness |
| **F-031** | Offline License Limits & Entitlements Evaluated Client-Side | **Medium** | Confirmed | Packages (`session_persistence.ts`, `device_gate.ts`) | Confirmed Weakness |
| **F-032** | LAN Command Pipeline Trusts Unauthenticated Self-Declared Role | **Medium** | Confirmed | Packages (`sync/src/command_pipeline.ts`) | Confirmed Weakness |
| **F-033** | Committed 93 MB Prebuilt Binary and Secret `.local_service_key` in Git | **High** | Confirmed | Tooling (`tooling/local-runtime/`) | Confirmed Weakness |
| **F-034** | Installer Script Modifies Windows User Root Trust Store | **High** | Confirmed | Tooling (`build_windows_installers.cjs:661-669`) | Confirmed Weakness |
| **F-035** | Read-Only Platform Roles Can Obtain Full S3 Backup Download URLs | **Medium** | Confirmed | Cloud API (`access.ts:69`, `platform-backups.controller.ts`) | Confirmed Weakness |
| **F-036** | Sensitive Aadhaar (`uidai`) and PAN Exposed Unmasked in Tenant View | **High** | Confirmed | Cloud API (`payments/payment-connections.service.ts`) | Confirmed Weakness |
| **F-037** | Device Token Allows Arbitrary WhatsApp/SMS Messages Without Quota | **Medium** | Confirmed | Cloud API (`notifications/receipts.controller.ts`) | Confirmed Weakness |
| **F-038** | CSV Formula Injection & Unsanitized Filename in Report Exports | **Low** | Confirmed | Cloud API (`reports.service.ts:260-318`, `reports.controller.ts`) | Confirmed Weakness |
| **F-039** | Onboarding Wizard Persists Initial Passwords & Tokens in `localStorage` | **Medium** | Confirmed | Super Admin (`OnboardRestaurantPage.tsx:315-325`) | Confirmed Weakness |
| **F-040** | Uncapped 20 MB JSON Request Limit & Unbounded Telemetry Queries | **Low** | Confirmed | Cloud API (`main.ts:22`, `sync-observability.controller.ts`) | Confirmed Weakness |
| **F-041** | Public Activation Endpoint Discloses Registered Platform Teammates | **Low** | Confirmed | Cloud API (`platform-users.service.ts:84-97`) | Confirmed Weakness |
| **F-042** | Hardcoded Demo Staff PIN `1234` in Captain State Store | **Low** | Confirmed | Captain (`captainStore.ts:63-67`) | Confirmed Weakness |
| **F-043** | Missing Branch-Level Isolation Across Sync & Operational Services | **High** | Confirmed | Cloud API (`order-sync.service.ts`, PostgreSQL schema) | Confirmed Architecture Gap |
| **F-044** | `EntitlementGuard` Unwired Dead Code with Insecure Header Fallback | **Low** | Confirmed | Cloud API (`entitlement.guard.ts:35`) | Confirmed Weakness |
| **F-045** | Architectural Documentation Disagrees with Runtime Code | **Informational** | Confirmed | Docs (`monorepo-structure.md`) | Documentation Drift |
| **F-046** | Local API `.env` Connects as Superuser, Silently Bypassing Postgres RLS | **Medium** | Confirmed | Cloud API (`.env:1`, `rls-role.ts`) | Configuration Concern |
| **F-047** | Monorepo Supply Chain Hygiene: Missing NPM Script Protections | **Low** | Confirmed | Tooling / Monorepo (`package.json:64-71`) | Configuration Concern |

---

## Detailed Findings

### F-001 — Tenant Invoice Payment & Subscription Renewal Bypass
- **Severity:** Critical (CVSS 4.0: 9.3 / High Impact)
- **Confidence:** Confirmed
- **Affected Route:** `POST /api/v1/tenant/billing/invoices/:id/pay`
- **Source Files:** `cloud/api/src/modules/billing/tenant-billing.controller.ts:40-48`, `invoices.service.ts:830-905`
- **Vulnerability Category:** Business Logic / Broken Function-Level Authorization / Missing Payment Verification
- **Root Cause Analysis:** The controller applies only `TenantAuthGuard`, allowing any role (including `STAFF`). When invoked, `processTenantPayment` creates a `COMPLETED` payment using request parameters (`amount` defaults to `invoice.totalAmount`, `method`, `referenceNumber`), updates invoice status to `PAID`, and immediately executes:
  ```ts
  await tx.subscription.update({
    where: { id: invoice.subscriptionId },
    data: { status: 'ACTIVE', expiresAt: invoice.billingPeriodEnd }
  });
  ```
  The endpoint never contacts a payment gateway (Cashfree) or verifies payment receipt.
- **Impact:** Any restaurant staff member can perpetually renew their SaaS subscription without paying.
- **Remediation:** Remove client-triggered invoice settlement. Invoice payment completion must occur strictly via validated Cashfree gateway webhooks or direct server-to-server gateway status verification. Restrict the route to `OWNER` and limit it to initializing gateway payment sessions.

---

### F-002 — LAN Local Core Unauthenticated Server (0.0.0.0, CORS `*`)
- **Severity:** High
- **Confidence:** Confirmed
- **Affected Service:** `tooling/local-runtime/standalone_local_core.cjs`, POS Tauri Sidecar (`JamanvaarLocalCore.exe`)
- **Source Files:** `standalone_local_core.cjs:7,96,140-168`, `tauri.conf.json:46`
- **Vulnerability Category:** Missing Authentication / Cross-Origin Resource Sharing Misconfiguration
- **Root Cause Analysis:** `standalone_local_core.cjs` listens on `0.0.0.0:5178` with header `Access-Control-Allow-Origin: *`. Endpoint `GET /api/orders` returns all restaurant orders in plaintext. `POST /api/orders` accepts arbitrary JSON payloads without authentication or body size limits and broadcasts them over SSE.
- **Impact:** Any device on the restaurant Wi-Fi or any website visited on a terminal browser can read customer orders, inject fake tickets, or cause a denial of service via memory exhaustion.
- **Remediation:** Bind the server to `127.0.0.1` unless cross-device LAN operation is explicitly enabled. Implement token authentication (matching `local_service.cjs`), restrict CORS to authorized origins, and enforce a 1 MB request body limit.

---

### F-003 — Unauthenticated Telemetry Event Injection into Platform Table
- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected Route:** `POST /api/v1/platform/telemetry/events`
- **Source Files:** `cloud/api/src/modules/sync-observability/sync-observability.controller.ts:53-57`, `sync-observability.service.ts:120-134`
- **Vulnerability Category:** Broken Authentication / Missing Access Control
- **Root Cause Analysis:** Unlike adjacent endpoints that require `PlatformAuthGuard`, `POST events` has no guards. The method calls `prisma.platformDb.syncEventLog.create(...)` using caller-supplied parameters.
- **Impact:** Anonymous actors can inject false sync events, manipulate observability dashboards, and test database IDs via foreign-key violation errors.
- **Remediation:** Apply `DeviceAuthGuard` to the endpoint and bind `restaurantId` and `deviceId` to the authenticated device token.

---

### F-004 — Excessive Credential & Secret Exposure in Support Search
- **Severity:** High
- **Confidence:** Confirmed
- **Affected Route:** `GET /api/v1/support/search?q=`
- **Source Files:** `cloud/api/src/modules/support/support.service.ts:47-84`, `common/rbac/access.ts:61-64,79`
- **Vulnerability Category:** Excessive Data Exposure / Broken Object-Property Authorization
- **Root Cause Analysis:** The Prisma queries in `support.service.ts` query `User`, `Device`, and `ActivationKey` without a `select` clause, returning full database rows. This returns `User.passwordHash`, `User.activationTokenHash`, `Device.deviceTokenHash`, and the plaintext `ActivationKey.code`. RBAC grants `support: 'read'` to `READ_ONLY`.
- **Impact:** Any internal support staff member or compromised `READ_ONLY` token can harvest password hashes and active device activation keys across all tenants.
- **Remediation:** Implement explicit field selection allow-lists (`select`) on all queries and never return password hashes or activation codes.

---

### F-005 — Support `resendInvite` Returns Plaintext Activation Token
- **Severity:** Medium
- **Confidence:** Confirmed
- **Affected Route:** `POST /api/v1/support/users/:id/resend-invite`
- **Source Files:** `cloud/api/src/modules/support/support.service.ts:168-211`
- **Vulnerability Category:** Authentication Bypass / Credential Disclosure
- **Root Cause Analysis:** When generating a replacement activation token, the service returns `{ ...updated, activationToken, emailSent }` directly in the HTTP response body to the support operator.
- **Impact:** A support user with `support:write` can obtain the activation token and set the restaurant owner's password, taking over the tenant account.
- **Remediation:** Transmit the activation token solely via configured email templates. Never include one-time tokens in API responses.

---

### F-006 — Tracked `live_db.json` Contains Unhashed Staff PINs & Demo PII
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `packages/database/src/live_db.json:7279-7307`
- **Vulnerability Category:** Hardcoded Credentials / Insecure Data Storage
- **Root Cause Analysis:** `packages/database/src/live_db.json` is committed in the repository and copied into installers. The file contains plaintext staff PINs (`"pinCode": "9999"` for Admin, `"5678"` for Manager, `"1234"` for Cashier) without the `pinv1:` hash prefix.
- **Impact:** Default installations share known credentials, enabling unauthorized local elevation of privilege on any terminal.
- **Remediation:** Untrack `live_db.json` from git. Enforce credential initialization on first launch.

---

### F-007 — QR Table Token Validation Bypass & Client-Side Pricing
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `packages/database/src/repositories.ts:3916`, `apps/restaurant-system/pos-admin/src/pages/GuestQrOrderingPage.tsx`
- **Vulnerability Category:** Broken Authentication / Client-Controlled Calculation
- **Root Cause Analysis:** Line 3916 contains `if (token !== undefined && token !== table.qrToken)`. If a client omits the token (`undefined`), validation passes. Additionally, order totals are calculated in the guest's browser rather than on the server.
- **Impact:** Guests can place orders to arbitrary tables without scanning the physical QR code and tamper with order item totals.
- **Remediation:** Enforce mandatory QR token presence: `if (!token || token !== table.qrToken)`. Calculate all totals on the backend.

---

### F-008 — Client Database Blindly Overwrites Users, Roles & License from Sync
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `packages/database/src/db.ts:760-763`
- **Vulnerability Category:** Integrity Violation / Broken Access Control
- **Root Cause Analysis:** In `db.ts`, responses from `GET /api/sync` directly overwrite local state:
  ```ts
  if (data && Array.isArray(data.users)) this.users = data.users;
  if (data && Array.isArray(data.roles)) this.roles = data.roles;
  if (data && data.license) this.license = data.license;
  ```
  The endpoint does not verify a cryptographic signature on license certificates before assignment.
- **Impact:** A rogue or tampered LAN sync server can elevate privileges or unlock PRO features on client terminals.
- **Remediation:** Cryptographically verify all license updates using `license_certificate.ts` and restrict user/role modifications.

---

### F-009 — Local Core Pairing Endpoint Lacks Rate Limiting (Brute-Forceable PIN)
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `tooling/local-runtime/local_service.cjs:229-254`
- **Vulnerability Category:** Inadequate Rate Limiting / Authentication Brute Force
- **Root Cause Analysis:** The `/devices/pair` endpoint compares a 6-digit numeric PIN against `PAIRING_PIN` (100,000–999,999) without attempt limits, lockout delays, or rate limits.
- **Impact:** A local network attacker can brute-force the 900,000 combinations within minutes to obtain the long-lived `SERVICE_KEY`.
- **Remediation:** Implement lockout mechanisms (e.g. 5 failed attempts locks for 15 minutes), constant-time string comparison, and increase PIN entropy.

---

### F-010 — Tenant Login Bypasses Device Token Check When `deviceId` Provided
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:272-280`
- **Vulnerability Category:** Authentication Bypass
- **Root Cause Analysis:** In `tenant-auth.service.ts`:
  ```ts
  if (activeDevice) {
    if (deviceToken && activeDevice.deviceTokenHash) {
      if (hashOpaqueToken(deviceToken) === activeDevice.deviceTokenHash) {
        isDeviceActive = true;
      }
    } else {
      isDeviceActive = true; // Bypasses check if deviceToken omitted!
    }
  }
  ```
- **Impact:** Anyone with valid user credentials can bind to any active device of the restaurant simply by omitting `deviceToken`.
- **Remediation:** Require `deviceToken` whenever `deviceId` is provided.

---

### F-011 — Activation Key Redemption Race Condition & Plaintext Code Storage
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/activation-keys/activation-keys.service.ts:245-312`, `schema.prisma:358`
- **Vulnerability Category:** Concurrency Race Condition / Insecure Credential Storage
- **Root Cause Analysis:** `redeem()` performs a non-locking `findUnique` followed by an update. Two concurrent requests presenting the same key can both pass the status check. Furthermore, `ActivationKey.code` is stored in plaintext.
- **Impact:** Device limits can be exceeded via concurrent requests. Plaintext codes in database dumps allow unauthorized device activation.
- **Remediation:** Use an atomic update with conditional clause (`UPDATE ... WHERE code = :code AND status = 'ACTIVE'`). Store activation codes as SHA-256 hashes.

---

### F-012 — Refresh Token Rotation Non-Atomic & Lacks Family Revocation
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:528-565`
- **Vulnerability Category:** Broken Session Management
- **Root Cause Analysis:** The token validation and revocation are executed in separate transactions. If a revoked token is replayed, the system returns an error without invalidating the token family.
- **Impact:** Stolen refresh tokens can be replayed if concurrent requests are sent, and token theft is not automatically mitigated via family invalidation.
- **Remediation:** Perform check-and-revoke in a single database transaction with row-level locks. Invalidate all active tokens for a user when token reuse is detected.

---

### F-013 — Device Activation Bypasses `Plan.maxDevices` Limit
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:383-466`
- **Vulnerability Category:** Business Logic / Authorization Bypass
- **Root Cause Analysis:** While `activation-keys.service.ts:redeem` enforces `Plan.maxDevices`, `tenant-auth.service.ts:activateDevice` completely omits this check. Furthermore, lines 421-424 accept any key type if `deviceType === 'POS_ADMIN'`.
- **Impact:** Tenants can activate unlimited devices and bypass device quotas via the `activateDevice` route.
- **Remediation:** Port the `Plan.maxDevices` quota check to `activateDevice` and enforce strict key type compatibility.

---

### F-014 — Order Sync Trusts Client Totals Without Server-Side Repricing
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/order-sync/order-sync.service.ts:60-86`
- **Vulnerability Category:** Client-Controlled Calculation / Broken Business Logic
- **Root Cause Analysis:** The order synchronization bridge accepts client-provided `subtotal`, `taxAmount`, `discountAmount`, `totalAmount`, and `paymentStatus` without validating against database pricing or payment records. Any device can overwrite existing orders without optimistic concurrency checks.
- **Impact:** A compromised terminal or kiosk can record orders with manipulated prices, fraudulent discounts, or forged payment statuses.
- **Remediation:** Re-verify menu item pricing on the server, reject client-asserted payment status changes, and enforce optimistic concurrency versions.

---

### F-015 — Entity Sync Permits Any Device Type to Pull Customer PII
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/entity-sync/entity-sync.controller.ts:15-32`, `dto/push-entity-sync.dto.ts:3`
- **Vulnerability Category:** Broken Object Property Level Authorization / Excessive Data Exposure
- **Root Cause Analysis:** The controller applies `DeviceAuthGuard` but does not check `device.type`. Any device (including customer-facing Kiosks) can invoke `GET /api/v1/entity-sync/CUSTOMER` and retrieve customer PII.
- **Impact:** Customer personal data (names, phone numbers, addresses, loyalty information) is exposed to untrusted kiosk terminals.
- **Remediation:** Restrict entity synchronization permissions by device type. Allow customer entity access only to `POS` and `POS_ADMIN`.

---

### F-016 — Refunds Initiated by Device Token Alone Without Staff Authentication
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/payments/payment-orders.controller.ts:29-36`, `payments.service.ts:137-180`
- **Vulnerability Category:** Broken Function Level Authorization / Concurrency Flaw
- **Root Cause Analysis:** `POST /api/v1/payments/:paymentId/refund` requires only a POS device token. No staff PIN or user identity is verified. The refund calculation is not wrapped in a locking transaction, enabling concurrent over-refunds.
- **Impact:** Any terminal operator or bearer of a stolen device token can refund arbitrary transactions.
- **Remediation:** Require a signed staff authorization token for refund operations. Execute the balance check and refund creation inside a `SELECT ... FOR UPDATE` transaction.

---

### F-017 — Cashfree Webhook Persists Unauthenticated Payloads Without Rate Limit
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/payments/cashfree-webhook.controller.ts:10`, `payments.service.ts:212-226`
- **Vulnerability Category:** Denial of Service / Resource Exhaustion
- **Root Cause Analysis:** The webhook controller is annotated with `@SkipThrottle()`. If signature verification fails, the service writes the invalid payload (up to 1 MB) into the `WebhookEvent` database table via `runAsPlatform`.
- **Impact:** Attackers can flood the endpoint with invalid payloads to exhaust database storage.
- **Remediation:** Reject invalid signatures immediately with an HTTP 400 response without persisting to the database. Enforce IP-based rate limiting on webhook routes.

---

### F-018 — Stored XSS via File Upload in Master Menu Catalog
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/master-catalog/master-catalog.service.ts:250,265-279`
- **Vulnerability Category:** Unrestricted File Upload / Stored Cross-Site Scripting (XSS)
- **Root Cause Analysis:** The service allows `image/svg+xml`, extracts the file extension from user-supplied `dto.fileName`, and writes the uploaded file directly into `../super-admin-web/public/assets/uploads/catalog`.
- **Impact:** An attacker can upload an SVG or HTML file containing malicious JavaScript, which executes under the Super Admin web dashboard origin when viewed.
- **Remediation:** Disallow SVG and HTML uploads. Derive file extensions strictly from validated magic bytes. Store uploads in isolated object storage (S3) on a separate origin.

---

### F-019 — Device Bearer Token Non-Expiring, Non-Rotating in `localStorage`
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/common/guards/device-auth.guard.ts:22-26`, client `cloudClient.ts`
- **Vulnerability Category:** Insecure Credential Storage / Missing Token Rotation
- **Root Cause Analysis:** Device tokens are generated once at activation and never expire or rotate. Clients persist them in browser `localStorage`.
- **Impact:** If a token is stolen via XSS or physical access, the attacker retains indefinite API access until manual revocation.
- **Remediation:** Store device tokens in OS-backed secure storage (e.g. Tauri Keyring) or secure HTTP-only cookies. Implement automated token rotation.

---

### F-020 — Tenant Backup Endpoints Lack Role-Based Authorization Guards
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/backups/tenant-backups.controller.ts:8-29`
- **Vulnerability Category:** Broken Function Level Authorization
- **Root Cause Analysis:** The controller uses only `TenantAuthGuard` without role restrictions. Any tenant user (including `STAFF` or `CASHIER`) can trigger, list, and download full database backups.
- **Impact:** Low-privileged staff members can export full restaurant operational data, customer lists, and financial records.
- **Remediation:** Restrict backup creation and download endpoints to `OWNER` and `MANAGER` roles.

---

### F-021 — Owner Password Reset Accepts Weak Passwords & Ignores Target Role
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/owners/owners.service.ts:101-115`, `owners.controller.ts:50`
- **Vulnerability Category:** Weak Password Policy / Session Invalidation Flaw
- **Root Cause Analysis:** `POST /api/v1/owners/:id/reset-password` accepts passwords as short as 4 characters, does not verify that the target user has role `OWNER`, automatically reactivates disabled accounts, and fails to revoke active refresh tokens.
- **Impact:** Weak credentials can be assigned to administrative accounts, and existing sessions remain active after a password reset.
- **Remediation:** Enforce the standard 10-character password complexity rule, verify `user.role === 'OWNER'`, preserve account status, and revoke all active sessions upon password change.

---

### F-022 — Support Impersonation Access Token Leaked in URL Query String
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/super-admin-web/src/pages/restaurants/RestaurantDetailPage.tsx:537`
- **Vulnerability Category:** Sensitive Data Exposure via URL
- **Root Cause Analysis:** When a support administrator initiates impersonation, the frontend executes:
  ```ts
  window.open(`http://localhost:5176?impersonationToken=${encodeURIComponent(res.accessToken)}`, '_blank');
  ```
- **Impact:** The JWT access token is logged in browser history, proxy access logs, and HTTP Referer headers.
- **Remediation:** Exchange the token via a short-lived one-time authorization code or pass it via `window.postMessage`.

---

### F-023 — JWT Verification Does Not Pin Algorithm & Shares Secret Across Realms
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/common/guards/platform-auth.guard.ts:43`, `tenant-auth.guard.ts:39`
- **Vulnerability Category:** Cryptographic Hygiene / Token Reuse
- **Root Cause Analysis:** `jwt.verifyAsync` does not specify `algorithms: ['HS256']`. Both platform and tenant modules use the same `JWT_ACCESS_SECRET`.
- **Impact:** Vulnerable to algorithm confusion if token headers are tampered with. Shared secrets weaken separation between platform administration and tenant data.
- **Remediation:** Explicitly configure `algorithms: ['HS256']` in verification options and use distinct secret keys for platform and tenant tokens.

---

### F-024 — Missing Account Lockout, In-Memory Throttler & Timing Attack Oracle
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:221-242`, `app.module.ts:47-52`
- **Vulnerability Category:** Inadequate Brute Force Protection / Side-Channel Leak
- **Root Cause Analysis:** The system does not lock accounts after repeated login failures. When `restaurantId` is omitted, the server runs `bcrypt.compare` across all candidate accounts matching the email, revealing account existence via response time differences.
- **Impact:** Attackers can perform brute-force password spraying and enumerate valid email addresses.
- **Remediation:** Implement distributed account-based lockout (e.g. Redis), constant-time dummy hashing for invalid users, and cap candidate evaluations.

---

### F-025 — Production Security Posture Depends on Unenforced `NODE_ENV`
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/prisma/rls-role.ts:22`, `package.json:10`
- **Vulnerability Category:** Security Misconfiguration
- **Root Cause Analysis:** `npm run start:prod` executes `node dist/src/main.js` without setting `NODE_ENV=production`. If `NODE_ENV` is unset, `assessRlsRole` issues only a warning instead of failing startup, and session cookies are transmitted without the `Secure` flag.
- **Impact:** A production server started with an unset environment variable silently bypasses Postgres RLS enforcement and transmits unencrypted cookies.
- **Remediation:** Explicitly set `NODE_ENV=production` in the start script and fail application bootstrap if `NODE_ENV` is undefined.

---

### F-026 — Local Core Trusts Client-Supplied Prices, Statuses & Discounts
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `tooling/local-runtime/local_service.cjs:298-604`
- **Vulnerability Category:** Client-Controlled Calculation / Integrity Violation
- **Root Cause Analysis:** `local_service.cjs` accepts client-calculated prices and discount amounts. Payment status defaults to `SUCCESS` if omitted.
- **Impact:** Local order records and accounting reports can be manipulated by compromised terminal clients.
- **Remediation:** Enforce server-side item price resolution and validate all discounts against authorized ranges.

---

### F-027 — Local Core `/api/sync` Broadcasts Full Store Over Unauthenticated SSE
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `tooling/local-runtime/local_service.cjs:607-647,282`
- **Vulnerability Category:** Excessive Data Exposure / Missing Access Control
- **Root Cause Analysis:** The `/api/sync` endpoint allows replacing users, roles, and licenses, and broadcasts the complete database state over SSE to any connected client.
- **Impact:** Staff credentials and operational records are exposed to any local network device.
- **Remediation:** Sanitize broadcast payloads to exclude sensitive credentials and require authentication on SSE streams.

---

### F-028 — Tauri Shell Arbitrary TCP Socket Command with `csp: null`
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `apps/restaurant-system/pos/src-tauri/src/main.rs:65-81`, `tauri.conf.json:26`
- **Vulnerability Category:** Network Pivoting / Missing Content Security Policy
- **Root Cause Analysis:** The `send_escpos_bytes` command allows connecting to arbitrary IP addresses and TCP ports. In `tauri.conf.json`, `csp` is set to `null`.
- **Impact:** A script in the webview can establish arbitrary TCP connections across the internal network, functioning as an SSRF/pivoting vector.
- **Remediation:** Restrict network destinations to configured thermal printer IP addresses and define a strict Content Security Policy in `tauri.conf.json`.

---

### F-029 — Kiosk Connects to Untrusted Host Defined in UDP Beacon Payload
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `apps/kiosk-system/kiosk-user/src-tauri/src/main.rs:24-60`
- **Vulnerability Category:** Insecure Discovery Protocol / Man-in-the-Middle
- **Root Cause Analysis:** `discover_local_core` parses the target IP and port from the UDP beacon message body (`JAMANVAAR_CORE|<ip>|<port>`) instead of validating against `src_addr`.
- **Impact:** Any device on the LAN can broadcast a spoofed UDP packet and redirect the customer kiosk to a malicious server.
- **Remediation:** Authenticate discovery beacons using a shared pre-shared key (PSK) or TLS certificate pinning.

---

### F-030 — Insecure Staff PIN Hashing via Fast 32-bit FNV-1a Algorithm
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `packages/database/src/pin.ts:15-32`
- **Vulnerability Category:** Weak Cryptographic Hash
- **Root Cause Analysis:** Staff PINs are hashed using double-round 32-bit FNV-1a. Because 4-digit PINs have only 10,000 combinations, a fast non-cryptographic hash can be cracked in less than a millisecond.
- **Impact:** Offline database dumps allow immediate recovery of all staff PINs.
- **Remediation:** Upgrade to a memory-hard, salted algorithm (such as Argon2id or scrypt) for local PIN verification.

---

### F-031 — Offline License Limits & Entitlements Evaluated Client-Side
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `packages/sync/src/device_gate.ts:41,155-160`, `packages/database/src/db.ts:976`
- **Vulnerability Category:** Client-Side Enforcement of Server Security Rules
- **Root Cause Analysis:** Offline duration checks (e.g. 7-day limits) and feature gates read unverified local state in `localStorage`.
- **Impact:** Manipulating system time or `localStorage` values bypasses offline feature restrictions.
- **Remediation:** Use cryptographically signed offline lease tokens with monotonic counter verification.

---

### F-032 — LAN Command Pipeline Trusts Unauthenticated Self-Declared Role
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `packages/sync/src/command_pipeline.ts:33-40,113`
- **Vulnerability Category:** Missing Message Authentication / Privilege Spoofing
- **Root Cause Analysis:** LAN mesh commands include a `senderRole` string field without cryptographic signature or message authentication code (MAC).
- **Impact:** Any connected device can claim `senderRole: 'ADMIN'` and execute privileged commands.
- **Remediation:** Sign all inter-terminal mesh commands using HMAC or asymmetric keys established during device pairing.

---

### F-033 — Committed 93 MB Prebuilt Binary and Secret `.local_service_key` in Git
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `tooling/local-runtime/JamanvaarLocalCore.exe`, `tooling/local-runtime/.local_service_key`
- **Vulnerability Category:** Hardcoded Secret / Supply Chain Risk
- **Root Cause Analysis:** A 93 MB binary executable and a live 48-byte secret key (`.local_service_key`) are committed to version control.
- **Impact:** Anyone with repository read access possesses the persistent bearer token accepted by local runtime services.
- **Remediation:** Remove `.local_service_key` from git, rotate the secret key, and exclude prebuilt `.exe` binaries from git tracking.

---

### F-034 — Installer Script Modifies Windows User Root Trust Store
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `tooling/installers/build_windows_installers.cjs:661-669`
- **Vulnerability Category:** Insecure System Configuration / Trust Store Manipulation
- **Root Cause Analysis:** The installer build script creates a self-signed code-signing certificate and imports it into `Cert:\CurrentUser\Root` and `TrustedPublisher`.
- **Impact:** Compromising the private key allows signing arbitrary executables that Windows will treat as trusted.
- **Remediation:** Use a legitimate publicly trusted Authenticode code-signing certificate. Never modify the user's root certificate store.

---

### F-035 — Read-Only Platform Roles Can Obtain Full S3 Backup Download URLs
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/common/rbac/access.ts:62,69`, `modules/backups/platform-backups.controller.ts`
- **Vulnerability Category:** Broken Object Level Authorization
- **Root Cause Analysis:** `access.ts` maps `/api/v1/restaurants/:id/backups` to the `ops` permission area. `READ_ONLY` and `SUPPORT_ADMIN` have `ops: 'read'`, allowing them to request presigned S3 URLs to download restaurant backups.
- **Impact:** Support operators can download complete database backups containing customer records and transaction histories.
- **Remediation:** Restrict backup download operations to `PLATFORM_OWNER` and `SUPER_ADMIN`.

---

### F-036 — Sensitive Aadhaar (`uidai`) and PAN Exposed Unmasked in Tenant View
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/payments/payment-connections.service.ts:120-135`
- **Vulnerability Category:** Sensitive Data Exposure / Regulatory Non-Compliance
- **Root Cause Analysis:** `getOwn()` returns unmasked `pan`, `gst`, `cin`, and `uidai` (Aadhaar) numbers in plaintext.
- **Impact:** Violates Indian data privacy regulations (Aadhaar Act, DPDP Act 2023). Exposed KYC data can lead to identity theft.
- **Remediation:** Mask sensitive identifiers (e.g. `XXXX-XXXX-1234` for Aadhaar and `XXXXX1234X` for PAN) in API responses.

---

### F-037 — Device Token Allows Arbitrary WhatsApp/SMS Messages Without Quota
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/notifications/receipts.controller.ts:14-24`
- **Vulnerability Category:** Resource Depletion / Relay Abuse
- **Root Cause Analysis:** `POST /api/v1/receipts/send` allows any device token to send SMS or WhatsApp template messages to arbitrary phone numbers without checking order association or message quotas.
- **Impact:** Abuse of messaging quotas, resulting in unexpected messaging charges for the platform owner.
- **Remediation:** Verify that the message corresponds to an active paid order and enforce daily rate limits per restaurant.

---

### F-038 — CSV Formula Injection & Unsanitized Filename in Report Exports
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/reports/reports.service.ts:273,292`, `reports.controller.ts:50`
- **Vulnerability Category:** CSV Injection / HTTP Header Injection
- **Root Cause Analysis:** Restaurant names and strings in CSV exports are not sanitized against formula triggers (`=`, `+`, `-`, `@`). The `Content-Disposition` header incorporates unsanitized query parameter `type`.
- **Impact:** Opening exported CSV files in spreadsheet applications can trigger formula execution.
- **Remediation:** Prefix dangerous characters with a single quote `'` and validate the `type` parameter against an allowlist.

---

### F-039 — Onboarding Wizard Persists Initial Passwords & Tokens in `localStorage`
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/super-admin-web/src/pages/Onboarding/OnboardRestaurantPage.tsx:318,324`
- **Vulnerability Category:** Insecure Storage of Sensitive Data
- **Root Cause Analysis:** The wizard persists draft state to `localStorage.setItem('jamanvaar_onboarding_draft_v1', ...)`, including `owner.initialPassword` and `ownerActivationToken`.
- **Impact:** Cleartext credentials remain stored in the browser after onboarding is completed.
- **Remediation:** Exclude passwords and activation tokens from draft persistence objects.

---

### F-040 — Uncapped 20 MB JSON Request Limit & Unbounded Telemetry Queries
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/main.ts:22`, `sync-observability.controller.ts:33`
- **Vulnerability Category:** Unrestricted Resource Consumption
- **Root Cause Analysis:** Global body parser accepts up to 20 MB JSON payloads prior to authentication. Several list queries accept uncapped `limit` parameters.
- **Impact:** Increased CPU and memory consumption during request parsing, enabling low-cost denial of service.
- **Remediation:** Reduce default JSON body limit to 1 MB and cap list query pagination at 100 items.

---

### F-041 — Public Activation Endpoint Discloses Registered Platform Teammates
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/platform-users/platform-users.service.ts:84-97`
- **Vulnerability Category:** Information Disclosure / User Enumeration
- **Root Cause Analysis:** Calling `GET /api/v1/platform-users/activation-status?email=target@example.com&token=invalid` returns `state: 'USED'` if the user exists and has activated, versus `state: 'INVALID'` if the email does not exist.
- **Impact:** Allows remote enumeration of registered platform administrator emails.
- **Remediation:** Return uniform error responses regardless of account existence unless a valid token is provided.

---

### F-042 — Hardcoded Demo Staff PIN `1234` in Captain State Store
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `apps/restaurant-system/captain/src/store/captainStore.ts:63-67`
- **Vulnerability Category:** Hardcoded Credentials
- **Root Cause Analysis:** `DEFAULT_CAPTAIN` initializes with `pin: '1234'`.
- **Impact:** Unprovisioned captain terminals default to known credentials.
- **Remediation:** Require initial credential setup during first-time terminal pairing.

---

### F-043 — Missing Branch-Level Isolation Across Sync & Operational Services
- **Severity:** High
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/modules/order-sync/order-sync.service.ts:130-136`, PostgreSQL migrations
- **Vulnerability Category:** Broken Object Level Authorization / Missing Isolation Boundary
- **Root Cause Analysis:** `catchUp()` queries `tx.syncedOrder.findMany({ where: { updatedAt: { gt: sinceDate } } })` without filtering by `branchId`. Furthermore, 19 operational tables have no PostgreSQL Row-Level Security.
- **Impact:** Terminals at one branch can view, pull, or modify orders and inventory belonging to other branches of the same restaurant.
- **Remediation:** Enforce `branchId` filtering on all synchronization queries and add Postgres RLS policies to all tenant-scoped operational tables.

---

### F-044 — `EntitlementGuard` Unwired Dead Code with Insecure Header Fallback
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/src/common/guards/entitlement.guard.ts:35`
- **Vulnerability Category:** Dead Code / Insecure Fallback
- **Root Cause Analysis:** The guard falls back to `request.headers['x-restaurant-id']` when user context is missing, and is not wired to any active controller in the codebase.
- **Impact:** Misleading security control that provides no runtime protection.
- **Remediation:** Remove the dead guard or refactor it into an active interceptor bound to validated JWT claims.

---

### F-045 — Architectural Documentation Disagrees with Runtime Code
- **Severity:** Informational
- **Confidence:** Confirmed
- **Source Files:** `docs/architecture/monorepo-structure.md:37,152`
- **Vulnerability Category:** Documentation Drift
- **Root Cause Analysis:** Documentation describes SQLite storage and labels the Local Core sidecar as orphaned, whereas the codebase uses in-memory JSON persistence and actively packages the sidecar into production installers.
- **Remediation:** Synchronize architecture documentation with actual runtime implementations.

---

### F-046 — Local API `.env` Connects as Superuser, Silently Bypassing Postgres RLS
- **Severity:** Medium
- **Confidence:** Confirmed
- **Source Files:** `cloud/api/.env:1`, `prisma/rls-role.ts:22`
- **Vulnerability Category:** Security Misconfiguration
- **Root Cause Analysis:** `cloud/api/.env` connects as `postgres` (superuser). In non-production environments (`NODE_ENV !== 'production'`), this triggers only a warning rather than halting execution.
- **Impact:** In development and test environments, Row-Level Security is completely bypassed, masking potential authorization bugs.
- **Remediation:** Mandate a dedicated non-superuser database role across all environments.

---

### F-047 — Monorepo Supply Chain Hygiene: Missing NPM Script Protections
- **Severity:** Low
- **Confidence:** Confirmed
- **Source Files:** `package.json:64-71`
- **Vulnerability Category:** Supply Chain Security
- **Root Cause Analysis:** `allowScripts` is configured as a root key in `package.json`, which standard NPM does not enforce, allowing dependency lifecycle scripts to execute during installation.
- **Remediation:** Migrate to modern package managers with explicit script sandboxing (pnpm or Yarn Berry with `enableScripts: false`).
