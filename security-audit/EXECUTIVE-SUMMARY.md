# EXECUTIVE SUMMARY — Jamanvaar Full Ecosystem Security Audit

**Audit Status:** Completed Static Code Review, Trust Boundary Mapping, and Data-Flow Verification.  
**Audited Target:** Jamanvaar Repository (`om7867/kiosk`), commit `d89777c` + active working tree.  
**Mode:** READ-ONLY Security Audit. No application source code or production databases were modified.  
**Scope:** Complete multi-application SaaS ecosystem (Super Admin, Cloud API, POS Terminal, POS/Restaurant Admin, KDS, Captain, Kiosk, Kiosk Admin, Local Core LAN runtime, shared packages).

---

## 1. Scope & Ecosystem Architecture
The Jamanvaar restaurant management platform is an offline-first, multi-tenant ecosystem spanning cloud infrastructure, local LAN services, and desktop/web terminals:
- **Cloud Backend & Services:** NestJS 10, Prisma 5.22, PostgreSQL with Row-Level Security (RLS), S3 backups, Cashfree payments, Meta WhatsApp Cloud / MSG91 notifications.
- **Platform Management:** Super Admin web console (`cloud/super-admin-web`) with role-based access control (RBAC).
- **On-Premises / Counter Terminal:** POS Terminal (`apps/restaurant-system/pos`) built with React/Vite + Tauri 2, embedding a Node.js SEA (Single Executable Application) sidecar (`JamanvaarLocalCore.exe`).
- **Restaurant & POS Admin:** Combined administrative console (`apps/restaurant-system/pos-admin`).
- **Kitchen & Floor Operations:** Kitchen Display System (`kds`) and Captain mobile PWA (`captain`).
- **Customer Self-Service:** Customer Kiosk (`kiosk-user`) in fullscreen Tauri 2 lockdown and Kiosk Admin (`kiosk-admin`).
- **LAN Services:** Node.js Local Core engines (`local_service.cjs` and `standalone_local_core.cjs`) providing local HTTP/SSE order dispatch and database synchronization.

---

## 2. Findings Summary & Severity Distribution

Every lead originally identified in reconnaissance has been inspected and validated directly against the source code.

| Severity | Confirmed Exploitable | Confirmed Security Weakness | Informational / Configuration | Total |
|---|:---:|:---:|:---:|:---:|
| **Critical** | 2 | 0 | 0 | **2** |
| **High** | 12 | 2 | 0 | **14** |
| **Medium** | 14 | 5 | 1 | **20** |
| **Low** | 6 | 2 | 1 | **9** |
| **Informational** | 0 | 0 | 2 | **2** |
| **TOTAL** | **34** | **9** | **4** | **47** |

---

## 3. Critical Business & Cross-Tenant Risks

### 1. Subscription & Revenue Bypass (F-001) [CRITICAL]
In `cloud/api/src/modules/billing/tenant-billing.controller.ts:40-48` and `invoices.service.ts:830-900`, any authenticated tenant user (including `STAFF` or `CASHIER`) can submit a `POST /api/v1/tenant/billing/invoices/:id/pay` request with arbitrary amounts and payment reference numbers. The server blindly creates a `COMPLETED` payment, marks the invoice `PAID`, and extends the tenant's SaaS subscription without calling any payment gateway or verifying funds.

### 2. Committed Live Service Key and Unauthenticated LAN Core (F-002, F-033) [CRITICAL]
The committed sidecar binary `JamanvaarLocalCore.exe` (93 MB) is built from `standalone_local_core.cjs`, which binds to `0.0.0.0:5178`, enables `Access-Control-Allow-Origin: *`, and enforces zero authentication on `/api/orders`. Furthermore, in `tooling/local-runtime/.local_service_key`, a live 48-character cryptographic bearer key (`b1300e...`) is committed in git, granting immediate privileged access to any node running `local_service.cjs`.

### 3. Cross-Tenant Credential & Secret Harvesting (F-004, F-035) [HIGH]
`GET /api/v1/support/search?q=` returns unfiltered Prisma query results containing bcrypt password hashes, invite token hashes, device token hashes, and **plaintext activation keys** across all tenants. This endpoint is accessible to the lowest platform role (`READ_ONLY`). Similarly, `READ_ONLY` and `SUPPORT_ADMIN` can fetch presigned S3 URLs to download complete restaurant database dumps containing customer PII and operational records.

### 4. Broken Branch Isolation & Unprotected Tables (F-043) [HIGH]
While PostgreSQL enforces Row-Level Security (RLS) across 19 core tables using `app.current_restaurant_id`, **branch isolation is non-existent**. A device or staff member assigned to Branch A can pull, update, or overwrite orders, KOTs, and customer entities belonging to Branch B. Furthermore, 19 tables (including `DeviceCommand`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `AuditLog`, `SupportTicket`) have **no Row-Level Security**, relying solely on application-level filtering.

### 5. Client-Side Order Manipulation & Payment Forgery (F-007, F-014, F-015, F-026) [HIGH]
The synchronization bridges (`order-sync.service.ts` and `entity-sync.service.ts`) trust client-calculated order totals, taxes, discounts, and payment statuses (`SUCCESS`). Any connected device (or compromised kiosk token) can inject or overwrite orders with arbitrary amounts, refund statuses, or pull customer PII without server-side validation.

### 6. Arbitrary TCP Socket Communication & Stored XSS (F-018, F-028) [HIGH]
The POS Tauri desktop shell registers `send_escpos_bytes`, permitting any script in the webview to open arbitrary TCP connections to internal network hosts and ports. With `csp: null` configured in `tauri.conf.json`, an XSS payload (or rogue LAN script) can pivot into internal networks. In addition, the Super Admin catalog image upload endpoint accepts `.svg` and `.html` files and writes them directly into the Super Admin web dashboard's `public/` directory, enabling stored XSS.

---

## 4. Verification Status Overview

| Security Dimension | Validated Against Source Code? | Status & Outcome |
|---|:---:|---|
| **Tenant Isolation (Postgres RLS)** | **YES** | Enforced at DB level for 19 tables; 19 tables lack RLS; **bypassed if connected as superuser `postgres` (as set in `.env`)**. |
| **Branch Isolation** | **YES** | **FAILED**: No branch boundary enforcement in cloud sync or reporting APIs. |
| **Authentication & Sessions** | **YES** | **FAILED**: Refresh token rotation non-atomic; shared JWT secrets; device token bypass on login. |
| **Entitlement & Device Licensing** | **YES** | **FAILED**: `activate-device` bypasses device limits; activation race condition; dead `EntitlementGuard`. |
| **Offline Sync & Mesh Integrity** | **YES** | **FAILED**: Client-calculated prices and payment statuses trusted; no optimistic concurrency. |
| **Payment & Billing Validation** | **YES** | **FAILED**: Invoices markable as PAID for free; refund concurrency race condition; unthrottled webhook DB write. |
| **Desktop Shell (Tauri 2)** | **YES** | **FAILED**: `csp: null`; arbitrary TCP socket command; unauthenticated UDP discovery beacon. |

---

## 5. Remediation Priority Summary
1. **P0 (Immediate Hotfix):**
   - Disable client-controlled invoice settlement (`processTenantPayment`) or mandate gateway webhook confirmation.
   - Remove committed `.local_service_key` and untrack `live_db.json`, `target/` directories, and prebuilt `.exe` binaries.
   - Apply strict field projection (`select`) on `support.service.ts:search` to redact hashes, passwords, and activation keys.
   - Enforce authentication, localhost binding, and request limits on LAN Local Core services.
2. **P1 (Core Security Hardening):**
   - Implement server-side re-pricing for order sync; do not trust client payment status or total amounts.
   - Add branch-level filtering (`branchId`) across sync, order, and reporting endpoints.
   - Fix atomic activation key redemption and atomic refund balance checks using SQL transactions with row locks.
   - Add Content Security Policy (`CSP`) and restrict `send_escpos_bytes` destination hosts in Tauri.
3. **P2 (Operational & Posture):**
   - Connect API using a dedicated non-superuser PostgreSQL role to guarantee RLS enforcement.
   - Separate JWT access secrets for platform and tenant contexts and pin `HS256`.

---

## 6. Audit Limitations & Scope Statement

- Testing was performed in static review and data-flow verification mode without executing intrusive payloads or modifying source code.
- Production environment configurations (TLS termination, cloud reverse proxies, live S3 bucket permissions, and hardware POS peripheral security) require independent environment-level verification.

**Conclusion:**  
*Security audit coverage and findings are limited to the repository, environments, and checks explicitly documented in this report. Absence of findings does not prove absence of vulnerabilities.*
