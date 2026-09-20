# ATTACK SURFACE INVENTORY & DATA-FLOW ARCHITECTURE

**Audit Scope:** Network Boundaries, API Endpoints, IPC Commands, Trust Boundaries, and System-to-System Communications.  
**Verification Level:** Comprehensive Code-Level & Architecture Verification.

---

## 1. System-Wide Data Flow & Trust Boundary Diagram

```
                             [ Internet / Public Network ]
                                          │
                                          │
                                          ▼
                         ┌──────────────────────────────────┐
                         │   Super Admin Web (:5180)        │
                         │   React / Vite / In-Memory JWT   │
                         └─────────────────┬────────────────┘
                                           │ Platform JWT + httpOnly Refresh
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLOUD BACKEND API (:4000)                               │
│  Controllers: Platform, Tenant, Device, Webhook                                        │
│  Guards: PlatformAuthGuard, TenantAuthGuard, DeviceAuthGuard, RolesGuard               │
│  Data Layer: Prisma ORM (38 Models) ──▶ PostgreSQL 16 (19 Tables with FORCE RLS)      │
│  Integrations: Cashfree (HMAC), AWS S3 (Backups), Meta WhatsApp Cloud, MSG91, SMTP     │
└────────────▲─────────────────────────────▲─────────────────────────────▲───────────────┘
             │ Cashfree Webhooks           │ Tenant JWT                  │ Device Bearer Token
             │ (HMAC-SHA256)               │                             │
    ┌────────┴────────┐         ┌──────────┴──────────┐       ┌──────────┴──────────┐
    │ Cashfree PG API │         │ POS / Rest. Admin   │       │ POS Terminal        │
    └─────────────────┘         │ Kiosk Admin         │       │ KDS, Captain, Kiosk │
                                └─────────────────────┘       └──────────▲──────────┘
                                                                         │ LAN Network
                                                                         ▼
                                                     ┌──────────────────────────────────────┐
                                                     │  LAN LOCAL CORE RUNTIME (:5178)      │
                                                     │  Node.js HTTP / SSE Orders Service   │
                                                     │  Local State: live_db.json           │
                                                     └──────────────────────────────────────┘
```

---

## 2. Trust Boundaries & Attack Vectors

### Boundary 1: Public Internet ──▶ Cloud API
- **Authentication:** Anonymous endpoints for login, refresh, device activation, activation key redemption, and Cashfree webhooks.
- **Vulnerabilities:**
  - **F-003:** `POST /api/v1/platform/telemetry/events` is completely unauthenticated, allowing anonymous log injection into `SyncEventLog`.
  - **F-017:** `POST /api/v1/payments/cashfree/webhook` is exempted from rate limiting (`@SkipThrottle()`), writing up to 1 MB of invalid request bodies into `WebhookEvent`.
  - **F-040:** Global body parser accepts 20 MB JSON payloads prior to authentication.
  - **F-041:** `GET /api/v1/platform-users/activation-status` discloses valid platform teammate emails via status differences (`USED` vs. `INVALID`).

### Boundary 2: Tenant Clients ──▶ Cloud API
- **Authentication:** `TenantAuthGuard` validates tenant JWT.
- **Vulnerabilities:**
  - **F-001 (CRITICAL):** `POST /api/v1/tenant/billing/invoices/:id/pay` allows any tenant user (including `STAFF`) to self-mark invoices `PAID` and renew subscriptions for free.
  - **F-020:** `TenantBackupsController` lacks role checks, allowing `STAFF` to download full restaurant database backups.
  - **F-010:** Tenant login allows users to bypass device token verification by passing `deviceId` without `deviceToken`.
  - **F-012:** Refresh token rotation is non-atomic and lacks token family revocation.

### Boundary 3: Device / Terminal ──▶ Cloud API
- **Authentication:** `DeviceAuthGuard` validates 32-byte opaque bearer tokens against `Device.deviceTokenHash`.
- **Vulnerabilities:**
  - **F-014:** `order-sync.service.ts` accepts client-calculated totals, taxes, and payment status flags without server-side repricing.
  - **F-015:** `entity-sync.controller.ts` allows any device token (including public Kiosks) to pull all `CUSTOMER` PII records.
  - **F-016:** `POST /api/v1/payments/:id/refund` allows any POS terminal device token to trigger Cashfree refunds without a staff manager PIN.
  - **F-019:** Device tokens are non-expiring, non-rotating, and stored in cleartext `localStorage`.
  - **F-037:** `POST /api/v1/receipts/send` allows any device token to send arbitrary SMS/WhatsApp messages to any phone number without order association or quotas.

### Boundary 4: Local LAN ──▶ Local Core & Inter-Terminal Mesh
- **Network Protocol:** HTTP, SSE (:5178), and UDP discovery beacons (:45678).
- **Vulnerabilities:**
  - **F-002:** `standalone_local_core.cjs` listens on `0.0.0.0:5178` with `Access-Control-Allow-Origin: *` and zero authentication on `/api/orders`.
  - **F-009:** `local_service.cjs` pairing endpoint (`/devices/pair`) has no attempt limiting on the 6-digit numeric PIN.
  - **F-027:** `local_service.cjs` broadcasts complete database state over SSE to any connected peer.
  - **F-029:** Customer Kiosk accepts target server IP directly from untrusted UDP beacon payloads.
  - **F-032:** Inter-terminal command pipeline trusts self-declared `senderRole` and `deviceId` without cryptographic signatures.
  - **F-033:** Live secret `.local_service_key` committed to git repository.

### Boundary 5: Frontend Webview ──▶ Native Host OS (Tauri 2)
- **Interface:** Tauri IPC commands (`send_escpos_bytes`, `get_machine_ip`, `get_local_core_info`).
- **Vulnerabilities:**
  - **F-028:** `send_escpos_bytes` establishes arbitrary raw TCP socket connections to any host and port. Configured with `csp: null` in `tauri.conf.json`, allowing scripts in the webview to pivot into internal networks.

### Boundary 6: Super Admin Web ──▶ Cloud Backend & File System
- **Interface:** Platform API calls and file uploads.
- **Vulnerabilities:**
  - **F-004:** Support search exposes password hashes, token hashes, and plaintext activation codes to `READ_ONLY` platform users.
  - **F-018:** Catalog dish image upload accepts SVG/HTML files, derives extension from client filename, and writes files directly into `super-admin-web/public/assets/uploads/catalog`, causing stored XSS.
  - **F-022:** Owner impersonation passes tenant access token in a plaintext URL query parameter.
  - **F-039:** Onboarding wizard writes initial passwords and activation tokens to browser `localStorage`.
