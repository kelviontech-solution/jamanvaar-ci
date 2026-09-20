# SECURITY TEST MATRIX — Jamanvaar Ecosystem Audit

**Status Definitions:**
- **PASS**: Control verified in source code and behaves securely as designed.
- **FAIL**: Verified security vulnerability or defect path confirmed in code.
- **PARTIAL**: Architectural control partially implemented or has known circumvention paths.
- **NOT TESTED**: Dynamic/runtime live execution not performed (read-only audit mode).
- **BLOCKED**: Requires live production network / third-party gateway access.

---

## Comprehensive Security Test Matrix

| # | Domain / Application | Security Check Performed | Observed Result | Source Evidence & Verification Reference | Status |
|---|---|---|---|---|:---:|
| **M01** | Platform RBAC | Fail-closed policy on unmapped platform paths | Unmapped routes restricted to Platform Owner / Super Admin | `cloud/api/src/common/rbac/access.ts:102-108` | **PASS** |
| **M02** | Platform RBAC / Support | Protection of credentials in platform support search | `READ_ONLY` role retrieves full user and device records with bcrypt hashes and plaintext activation keys | `support.service.ts:47-84`, `access.ts:61` (**F-004**) | **FAIL** |
| **M03** | Billing & Subscription | Payment verification on tenant invoice pay endpoint | Invoices marked `PAID` and subscription renewed with arbitrary client amount and zero gateway check | `invoices.service.ts:830-905`, `tenant-billing.controller.ts:40` (**F-001**) | **FAIL** |
| **M04** | Telemetry / Observability | Authentication and validation on sync event reporting | Anonymous `POST /platform/telemetry/events` writes unvalidated records into `SyncEventLog` | `sync-observability.controller.ts:53-57` (**F-003**) | **FAIL** |
| **M05** | Support Credential Handling | Secrecy of generated invitation tokens | Plaintext `activationToken` returned in HTTP response to support operator | `support.service.ts:211` (**F-005**) | **FAIL** |
| **M06** | Tenant Authentication | Device token validation during tenant user login | Device token check bypassed when `deviceId` is provided without `deviceToken` | `tenant-auth.service.ts:272-280` (**F-010**) | **FAIL** |
| **M07** | Session Management | Atomicity of refresh token rotation | Check-then-update executed across separate transactions; no family revocation on reuse | `tenant-auth.service.ts:528-565` (**F-012**) | **FAIL** |
| **M08** | Cryptographic Tokens | Algorithm pinning and secret separation in JWT verification | Algorithm `HS256` not pinned; shared secret used across platform and tenant tokens | `platform-auth.guard.ts:43`, `tenant-auth.guard.ts:39` (**F-023**) | **FAIL** |
| **M09** | Database Tenancy | PostgreSQL Row-Level Security enforcement on tenant tables | 19 tables have RLS; 19 tables lack RLS; bypassed if connected as PostgreSQL superuser | `schema.prisma`, `prisma.service.ts:29-42` (**F-043, F-046**) | **PARTIAL** |
| **M10** | Multi-Tenancy / Branch | Branch-level boundary enforcement in synchronization | Zero `branchId` filtering in order sync and entity sync catch-up routines | `order-sync.service.ts:130-136` (**F-043**) | **FAIL** |
| **M11** | Device Licensing | Concurrency race condition & device limit enforcement | Double-redeem possible under concurrency; `activateDevice` bypasses `Plan.maxDevices` | `activation-keys.service.ts:245`, `tenant-auth.service.ts:420` (**F-011, F-013**) | **FAIL** |
| **M12** | Payment Webhooks | Signature verification & resource consumption protection | HMAC verified via `timingSafeEqual`, but invalid deliveries persist to DB without rate limits | `cashfree-webhook.controller.ts:10`, `payments.service.ts:212` (**F-017**) | **PARTIAL** |
| **M13** | Payment Calculation | Server-side validation of order amounts and line items | Sync engine trusts client totals; guest QR ordering prices calculated in browser | `order-sync.service.ts:60-77`, `repositories.ts:3975` (**F-007, F-014**) | **FAIL** |
| **M14** | Payment Refunds | Authorization and concurrency in refund processing | Refund initiated with device token alone; non-atomic balance check permits over-refunds | `payment-orders.controller.ts:29-36`, `payments.service.ts:137` (**F-016**) | **FAIL** |
| **M15** | Entity Synchronization | Device-type permissions and customer PII protection | Any device token (including public Kiosks) can pull full `CUSTOMER` records | `entity-sync.controller.ts:15-32`, `push-entity-sync.dto.ts:3` (**F-015**) | **FAIL** |
| **M16** | Storage & Backups | Access control on tenant database snapshots | `READ_ONLY` and `SUPPORT_ADMIN` can generate presigned S3 download URLs | `access.ts:62,69`, `platform-backups.controller.ts` (**F-035**) | **FAIL** |
| **M17** | File Uploads | Validation of master catalog dish image uploads | File extension derived from client filename; SVG accepted; written to web `public/` dir | `master-catalog.service.ts:250-279` (**F-018**) | **FAIL** |
| **M18** | SQL Injection | Parameterization of raw SQL queries | Database queries use Prisma parameterization; `$executeRawUnsafe` protected by UUID regex | `prisma.service.ts:82`, `reports.service.ts:40` | **PASS** |
| **M19** | Denial of Service / Abuse | Pre-authentication request payload limits | Blanket 20 MB JSON body parser limit applies globally before authentication | `main.ts:22` (**F-040**) | **FAIL** |
| **M20** | Dependency Security | Known vulnerable dependencies scan | Outdated dependencies and unpinned versions identified in manifests | `package.json`, lockfiles (**F-047**) | **PARTIAL** |
| **M21** | Dynamic Authorization | Live dynamic penetration testing against running staging cluster | Read-only mode active; live traffic injection not authorized | Audited via static data-flow and logic analysis | **NOT TESTED** |
| **M22** | Automated Test Suite | Verification of existing test suite assertions | Existing test suites verified statically; requires dedicated non-superuser DB role | `cloud/api/test/tenant-isolation.spec.ts` | **NOT TESTED** |
| **M23** | Frontend Secret Storage | Persistence of sensitive credentials in browser storage | Onboarding wizard writes initial owner passwords and activation tokens to `localStorage` | `OnboardRestaurantPage.tsx:318,324` (**F-039**) | **FAIL** |
| **M24** | Platform Impersonation | Security of tenant owner support impersonation | Full access JWT token passed in plaintext URL query parameter | `RestaurantDetailPage.tsx:537` (**F-022**) | **FAIL** |
| **M25** | Desktop Shell (Tauri 2) | Native IPC commands and Content Security Policy | Arbitrary TCP socket command (`send_escpos_bytes`); `csp: null` in config | `pos/src-tauri/src/main.rs:65-81`, `tauri.conf.json:26` (**F-028**) | **FAIL** |
| **M26** | Local Terminal Auth | Cryptographic strength of staff PIN storage | 4-digit PINs hashed with fast 32-bit FNV-1a non-cryptographic hash (crackable in < 1 ms) | `packages/database/src/pin.ts:15-32` (**F-030**) | **FAIL** |
| **M27** | Embedded Datasets | Clearance of default and demo credentials in build | Tracked `live_db.json` contains plaintext PINs (`9999`, `5678`, `1234`) and customer data | `packages/database/src/live_db.json:7279` (**F-006**) | **FAIL** |
| **M28** | Local Synchronization | Verification of incoming sync payloads on terminal | Terminal overwrites users, roles, and licenses from unauthenticated peer sync responses | `packages/database/src/db.ts:760-763` (**F-008**) | **FAIL** |
| **M29** | Captain Mobile App | Hardcoded default credentials | Hardcoded default PIN `1234` in `DEFAULT_CAPTAIN` state | `captainStore.ts:63-67` (**F-042**) | **FAIL** |
| **M30** | Kitchen Display (KDS) | Order status manipulation and branch visibility | KDS client relies on unauthenticated LAN SSE stream; lacks branch isolation | `standalone_local_core.cjs:123`, `kds/src/App.tsx` | **PARTIAL** |
| **M31** | Kiosk User Terminal | Lockdown and peripheral navigation restrictions | Kiosk connects to untrusted IP supplied in unauthenticated UDP beacon body | `kiosk-user/src-tauri/src/main.rs:46` (**F-029**) | **FAIL** |
| **M32** | Kiosk Administration | Authorization and token storage | Kiosk Admin persists refresh tokens in browser `localStorage` | `kiosk-admin/src/cloud/cloudClient.ts:242` | **PARTIAL** |
| **M33** | QR Ordering Security | Enforcement of table identification token | QR table token is completely optional; omitting token passes validation | `repositories.ts:3916` (**F-007**) | **FAIL** |
| **M34** | Local Core Runtime (SEA) | Network exposure and authentication on sidecar | Sidecar listens on `0.0.0.0:5178` with CORS `*` and zero authentication | `standalone_local_core.cjs:7,96,140` (**F-002**) | **FAIL** |
| **M35** | Local Core Runtime (Service) | Pairing endpoint brute-force protection | 6-digit numeric PIN pairing endpoint has zero attempt limits or lockout | `local_service.cjs:229-254` (**F-009**) | **FAIL** |
| **M36** | Local Core Runtime (Service) | Order calculation & sync broadcast safety | Trusts client prices, defaults status to SUCCESS, broadcasts full DB over SSE | `local_service.cjs:282,607-647` (**F-026, F-027**) | **FAIL** |
| **M37** | Repository Hygiene | Git tracking of build artifacts and binaries | 93 MB executable `JamanvaarLocalCore.exe` committed to version control | `tooling/local-runtime/` (**F-033**) | **FAIL** |
| **M38** | Secret Leakage | Committed cryptographic keys in repository | Live 48-byte secret key `.local_service_key` committed in git repository | `tooling/local-runtime/.local_service_key` (**F-033**) | **FAIL** |
| **M39** | Windows Installer Security | System certificate store integrity | Installer build script imports self-signed cert into `Cert:\CurrentUser\Root` | `build_windows_installers.cjs:661-669` (**F-034**) | **FAIL** |
| **M40** | Environment Configuration | Verification of production environment variables | Missing default `NODE_ENV=production` in scripts; `.env` connects as PostgreSQL superuser | `cloud/api/package.json:10`, `.env:1` (**F-025, F-046**) | **FAIL** |
| **M41** | External Messaging | Access control and rate limits on receipt messaging | Any device token can send arbitrary SMS/WhatsApp messages without order validation | `receipts.controller.ts:14-24` (**F-037**) | **FAIL** |

---

## Summary of Results

| Total Checks | PASS | FAIL | PARTIAL | NOT TESTED | BLOCKED |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **41** | **2** | **31** | **6** | **2** | **0** |
