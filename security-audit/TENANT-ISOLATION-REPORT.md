# TENANT ISOLATION REPORT — Jamanvaar Ecosystem

**Audit Scope:** Multi-Tenant Architecture, Database Row-Level Security (RLS), Cross-Tenant Boundary Enforcement, Branch Scoping, and Cross-Device Permissions.  
**Verification Level:** Comprehensive Code-Level & Architecture-Level Verification.

---

## 1. Multi-Tenant Architecture Overview

Jamanvaar isolates tenants at multiple layers:
1. **Token Identity Binding:** Authentication tokens (`TenantAuthGuard`) resolve the tenant context strictly from the signed JWT claims (`restaurantId`) and verify the active restaurant record in PostgreSQL. No tenant endpoint accepts a client-asserted `restaurantId` query parameter or body property.
2. **Database Row-Level Security (RLS):**
   - Implemented in PostgreSQL via `SET LOCAL app.current_restaurant_id = '<uuid>'`.
   - 19 tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with `tenant_isolation` policies.
   - Enforced via `PrismaService.runAsTenant(restaurantId, tx => ...)`.
3. **Platform Context Separation:**
   - Platform (Super Admin) uses a structurally separate `PlatformUser` table and `platform-auth.guard.ts` with `app.is_platform_context = 'true'`.

---

## 2. Comprehensive Isolation Assessment by Dimension

| Dimension | Mechanism | Verified Status | Vulnerability / Gap |
|---|---|:---:|---|
| **Cross-Tenant Data Access (Cloud API)** | JWT token binding + `PrismaService.runAsTenant` + Postgres RLS on 19 tables | **CONFIRMED WORKING (With Caveats)** | Direct cross-tenant data leaks are prevented for tables with RLS **provided the database connects as a non-superuser** (see F-046). |
| **Branch Isolation (Cross-Branch)** | `User.branchId`, `Device.branchId` fields | **CONFIRMED BROKEN** | **F-043:** There is zero branch filtering in `order-sync.service.ts` or `entity-sync.service.ts`. A terminal in Branch A can pull and overwrite orders, KOTs, and customer entities of Branch B. |
| **Operational Tables Without RLS** | Application-level Prisma `where: { restaurantId }` filters | **CONFIRMED WEAKNESS** | **F-043:** 19 tables lack Postgres RLS: `DeviceCommand`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `AuditLog`, `SupportTicket`, `TicketComment`, `RestaurantMenuSyndication`, `RestaurantSandbox`, `BackupRestoreJob`, etc. An application coding error can query cross-tenant data. |
| **Cross-Device Isolation Within Tenant** | `DeviceAuthGuard` | **CONFIRMED BROKEN** | **F-014, F-015:** Any device type (e.g. Kiosk) can pull `CUSTOMER` PII and overwrite `PAYMENT_TRANSACTION` or `MENU_ITEM` entities via entity-sync and order-sync. |
| **Role Isolation Inside Tenant** | `TenantAuthGuard` | **CONFIRMED BROKEN** | **F-001, F-020:** Low-privileged roles (`STAFF`, `CASHIER`) can execute `POST /tenant/billing/invoices/:id/pay` to renew subscriptions for free and download full database backups via `/tenant/me/backups/:id/download`. |
| **Support / Platform Access to Tenant Data** | `access.ts` RBAC rules | **CONFIRMED WEAKNESS** | **F-004, F-035:** Read-only platform operators (`READ_ONLY`) can search across tenants and harvest bcrypt hashes, device token hashes, and plaintext activation codes, as well as download full restaurant S3 backup snapshots. |
| **Impersonation Boundary** | `support.service.ts:impersonateOwner` | **CONFIRMED WEAKNESS** | **F-022:** Impersonation JWT token is transmitted in a plaintext URL query parameter to `http://localhost:5176?impersonationToken=...`, leaking into browser history and server logs. |
| **Local Terminal Isolation** | Local Core HTTP/SSE services | **CONFIRMED BROKEN** | **F-002, F-006, F-030:** Unauthenticated LAN core (`0.0.0.0:5178`) with CORS `*` exposes local orders to any LAN client; weak 32-bit FNV-1a PIN hashing allows instant offline recovery of staff credentials. |

---

## 3. Database Layer RLS Verification

### RLS-Protected Tables (19 Tables):
1. `Restaurant`
2. `Branch`
3. `User`
4. `Device`
5. `Subscription`
6. `ActivationKey`
7. `TenantRefreshToken`
8. `Invoice`
9. `Payment`
10. `Backup`
11. `ApplicationEntitlement`
12. `MenuSnapshotItem`
13. `Order`
14. `PaymentTransaction`
15. `RestaurantPaymentConnection`
16. `Refund`
17. `WebhookEvent`
18. `SyncedOrder`
19. `SyncedEntity`

### Tables Lacking Row-Level Security (19 Tables):
1. `DeviceCommand` (holds remote wipe/lock payloads!)
2. `SyncEventLog` (holds sync telemetry and device IDs)
3. `SyncConflict` (holds conflicting order payloads)
4. `OfflineExtension` (holds offline extension authorizations)
5. `AuditLog` (holds system audit trails across all tenants)
6. `SupportTicket` & `TicketComment` (holds tenant support communications)
7. `RestaurantMenuSyndication`
8. `RestaurantSandbox`
9. `BackupRestoreJob`
10. `InvoiceCounter`
11. `PlatformUser` & `PlatformRefreshToken`
12. `PlatformSetting`
13. `Plan` & `AppRelease`
14. `MasterMenuCategory` & `MasterMenuItem`

### Critical RLS Operational Flaw (F-046):
In `cloud/api/.env`:
`DATABASE_URL="postgresql://postgres:OMom1122@localhost:5432/jamanvaar?schema=public"`
PostgreSQL superusers (`postgres`) and roles with `BYPASSRLS` **completely bypass Row-Level Security policies even when `FORCE ROW LEVEL SECURITY` is enabled**. If deployed in this configuration, tenant isolation relies solely on application-level filtering.

---

## 4. Specific Multi-Tenant Threat Scenarios & Outcomes

### Scenario 1: Can Restaurant A access Restaurant B's data via API?
- **Analysis:** On endpoints backed by `runAsTenant` (orders, menu, invoices, settings), PostgreSQL RLS restricts queries to `app.current_restaurant_id`. Direct IDOR attempts (e.g. requesting Restaurant B's invoice ID with Restaurant A's bearer token) return `NotFoundException` (fail-closed).
- **Vulnerability:** Unprotected tables (such as `SyncEventLog`, `SyncConflict`, and `DeviceCommand`) rely solely on manual Prisma `where: { restaurantId }` filters. Furthermore, Support Search (`F-004`) leaks Restaurant B's user hashes and activation keys across tenants.

### Scenario 2: Can a branch-level staff member access or overwrite another branch's data?
- **Analysis:** **YES (Vulnerability F-043 confirmed).** The synchronization engine does not filter incoming or outgoing orders by `branchId`. A terminal at Branch 1 can pull all orders from Branch 2 via `GET /api/v1/order-sync/catch-up`, observe active table statuses, and push status changes affecting other branches.

### Scenario 3: Can a Cashier or Staff member perform Administrator actions?
- **Analysis:** **YES (Vulnerabilities F-001, F-020, F-030 confirmed).**
  - In cloud APIs, missing role checks on `/api/v1/tenant/billing/invoices/:id/pay` and `/api/v1/tenant/me/backups` allow any authenticated `STAFF` account to execute administrative functions.
  - On local POS terminals, staff PINs are hashed using fast 32-bit FNV-1a, and default credentials (`9999` for Admin) are committed in `live_db.json`.

### Scenario 4: Can a Restaurant Administrator access Super Admin functionality?
- **Analysis:** **NO.** Platform routes enforce `PlatformAuthGuard`, which validates `issuer: 'jamanvaar-platform'` and `audience: 'jamanvaar-platform'`, and queries the separate `PlatformUser` table. A tenant token is rejected by the platform guard.

---

## 5. Required Isolation Remediations
1. **Enforce Branch Boundaries:** Add mandatory `branchId` filtering to `order-sync.service.ts`, `entity-sync.service.ts`, and reporting queries.
2. **Apply RLS to All Tenant Operational Tables:** Add migration scripts enabling RLS on `DeviceCommand`, `SyncEventLog`, `SyncConflict`, `OfflineExtension`, `AuditLog`, and `SupportTicket`.
3. **Dedicated Non-Superuser Database Connection:** Require a dedicated `jamanvaar_app` PostgreSQL user without `SUPERUSER` or `BYPASSRLS` privileges in production.
4. **Role Enforcement on Tenant Controllers:** Apply `@UseGuards(RolesGuard)` and `@Roles('OWNER', 'MANAGER')` to billing, backup, and settings endpoints.
