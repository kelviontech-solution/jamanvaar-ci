# AUTHENTICATION & AUTHORIZATION REPORT — Jamanvaar Ecosystem

**Audit Scope:** Authentication Mechanisms, Session Lifecycles, RBAC Enforcement, Device Credential Security, and Authorization Boundaries.  
**Verification Level:** Comprehensive Static Code Review and Threat Modeling.

---

## 1. Credentials & Session Architecture

| Principal / Client | Authentication Credential | Storage Mechanism | Token Lifetime | Cryptographic Scheme | Verified Security Assessment |
|---|---|---|:---:|---|---|
| **Platform User (Super Admin)** | Email + Password (bcrypt) | Memory (`accessToken`), httpOnly Cookie (`refreshToken`) | Access: 15 min<br>Refresh: 30 days | HS256 JWT, issuer & audience: `jamanvaar-platform` | **Moderate:** Session state checked against DB, but JWT verification does not pin `algorithms: ['HS256']` and shares secret with tenant tokens (**F-023**). |
| **Tenant User (Restaurant Staff)** | Email + Password (bcrypt) | Memory / `localStorage` | Access: 15 min<br>Refresh: 30 days | HS256 JWT, issuer & audience: `jamanvaar-tenant` | **Weak:** Refresh rotation is non-atomic and lacks token family invalidation (**F-012**). Login allows device token bypass (**F-010**). |
| **Terminal / Device** | Opaque 32-byte Hex Bearer Token | Client `localStorage` (`cloudClient.ts`) | **Indefinite (No expiry)** | SHA-256 hash at rest in `Device.deviceTokenHash` | **High Risk:** Non-rotating, perpetual credential stored in browser `localStorage`. Stolen token grants permanent access until manual revocation (**F-019**). |
| **Activation Key** | `JMV-XXXX-XXXX-XXXX` (96-bit alphanumeric) | Database `ActivationKey.code` | Configurable (e.g. 7–30 days) | **Plaintext at rest** | **High Risk:** Plaintext storage in PostgreSQL; non-atomic redemption check enables concurrent double-redeem (**F-011**). |
| **Local Terminal Staff** | 4-digit Numeric PIN | In-memory / `localStorage` | 24-hour local shift | 32-bit FNV-1a non-crypto hash | **Critical Risk:** Fast hash enables instantaneous brute-forcing (< 1 ms); default PINs committed in `live_db.json` (**F-006, F-030**). |
| **LAN Local Core** | Hex `SERVICE_KEY` & 6-digit `PAIRING_PIN` | `.local_service_key` file | Persistent | Plaintext comparison | **Critical Risk:** Live key committed to git repository (**F-033**). Pairing PIN has zero attempt throttling (**F-009**). `standalone_local_core.cjs` has zero authentication (**F-002**). |
| **Guest QR Ordering** | QR Table Token | URL query string | Persistent per table | String comparison | **Broken:** Token is completely optional; omitting token passes validation (**F-007**). |

---

## 2. Authorization Enforcement & Role-Based Access Control (RBAC)

### Platform Control Plane (`access.ts`)
- **Architecture:** Ordered regex path rules match endpoints to functional areas (`restaurants`, `subscriptions`, `billing`, `devices`, `ops`, `support`, `catalog`, `audit`, `reports`, `team`, `settings`, `self`).
- **HTTP Method Mapping:** `GET`, `HEAD`, `OPTIONS` map to `read`; all other methods map to `write`. Unmapped paths fail-closed to `PLATFORM_OWNER` and `SUPER_ADMIN`.
- **Authorization Gaps Identified:**
  - **F-004:** `READ_ONLY` role is granted `support: 'read'`, which exposes `GET /api/v1/support/search`. The underlying Prisma query lacks a `select` projection, leaking full database rows containing bcrypt password hashes, invite token hashes, device token hashes, and plaintext activation keys across all tenants.
  - **F-035:** `READ_ONLY` and `SUPPORT_ADMIN` roles are granted `ops: 'read'`, which exposes `GET /api/v1/restaurants/:id/backups/:id/download`, returning presigned S3 URLs to download complete full database snapshots.

### Tenant API Plane (`cloud/api/src/modules/tenant-*`)
- **Architecture:** Protected via `TenantAuthGuard`, which verifies JWT claims (`sub`, `restaurantId`, `did`) and ensures the tenant account and restaurant status are `ACTIVE`.
- **Authorization Gaps Identified:**
  - **F-001 (CRITICAL):** Missing role-based guards on billing endpoints. Any tenant user (including `STAFF` or `CASHIER`) can call `POST /api/v1/tenant/billing/invoices/:id/pay` with arbitrary values, marking invoices `PAID` and renewing SaaS subscriptions without gateway payment verification.
  - **F-020:** Missing role-based guards on `TenantBackupsController`. Low-privileged staff can trigger and download full restaurant database backups.

### Device-to-Cloud API Plane (`DeviceAuthGuard`)
- **Architecture:** Validates bearer tokens against `Device.deviceTokenHash`. Checks that the device, restaurant, and subscription are active.
- **Authorization Gaps Identified:**
  - **F-014:** `OrderSyncController` does not enforce device-type permissions or optimistic concurrency. Any device can push updates overwriting existing orders.
  - **F-015:** `EntitySyncController` allows any authenticated device (including public customer Kiosks) to invoke `GET /api/v1/entity-sync/CUSTOMER` and pull full customer PII.
  - **F-016:** `POST /api/v1/payments/:paymentId/refund` allows any POS terminal device token to initiate financial refunds without requiring a staff PIN or user approval token.

---

## 3. Session Lifecycle & Token Management Analysis

### Refresh Token Rotation (`tenant-auth.service.ts:528-565`)
1. **Concurrency Flaw:** Lookup `findUnique({ where: { tokenHash } })` and revocation update `update({ where: { id: existing.id }, data: { revokedAt: new Date() } })` are executed in two separate database transactions. Rapid concurrent requests with the same refresh token can both succeed, minting duplicate active sessions.
2. **Missing Token Family Revocation:** When an already-revoked refresh token is replayed (indicating token theft), the server returns `UnauthorizedException('Invalid refresh token')` but does not invalidate the active descendant tokens belonging to that user.

### Device Token Storage & Lifetime (`device-auth.guard.ts`)
- Device tokens do not have an expiration timestamp (`expiresAt`).
- There is no automated rotation mechanism.
- Stored directly in browser `localStorage` in cleartext, making them vulnerable to extraction via XSS or local filesystem access.

---

## 4. Specific Authentication & Authorization Check Results

| Check Item | Result | Evidence & Technical Detail |
|---|:---:|---|
| **Server-Side Authentication Enforced on Every Protected Endpoint?** | **FAIL** | `POST /api/v1/platform/telemetry/events` (**F-003**) has zero guards. `standalone_local_core.cjs` (**F-002**) has no authentication on `/api/orders`. |
| **Revoked / Disabled Users Blocked Immediately?** | **PASS** | `TenantAuthGuard` and `PlatformAuthGuard` check user `status === 'ACTIVE'` on every request in database. |
| **Safe Refresh Token Rotation?** | **FAIL** | Non-atomic check-and-update allows race condition; no token family revocation upon reuse (**F-012**). |
| **Strict JWT Cryptographic Hygiene?** | **FAIL** | `jwt.verifyAsync` does not pin `algorithms: ['HS256']`. Platform and tenant tokens share the same secret key (**F-023**). |
| **Account Lockout & Brute-Force Defense?** | **FAIL** | No account-level lockout on login; in-memory rate limiting only; bcrypt CPU amplification timing oracle (**F-024**). Local pairing PIN endpoint lacks rate limits (**F-009**). |
| **Credential Masking in Support / Diagnostic Responses?** | **FAIL** | Support search exposes password hashes, token hashes, and plaintext activation codes (**F-004**). Support resend invite returns one-time activation token (**F-005**). |
| **Re-Authentication for Sensitive Operations?** | **PARTIAL** | Device wipe requires string confirmation phrase `WIPE DEVICE DATA`. However, password reset, backup export, and financial refunds require no re-authentication or secondary PIN. |
