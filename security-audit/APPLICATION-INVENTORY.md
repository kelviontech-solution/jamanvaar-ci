# APPLICATION INVENTORY — Jamanvaar Ecosystem

**Audit Method:** Comprehensive Static Code Review, Data-Flow Tracing, and Trust Boundary Verification across all discovered packages, services, applications, and runtimes.

---

## 1. Ecosystem Overview & Application Area Mapping

The Jamanvaar restaurant ecosystem comprises **7 frontend/client applications**, **2 runtime services**, **10 shared packages**, and a **PostgreSQL database layer**:

1. **Jamanvaar Super Admin:** Web application in `cloud/super-admin-web` (Vite / React 18). Control plane for platform owners, support, and billing operations.
2. **Jamanvaar Cloud API:** Backend in `cloud/api` (NestJS 10, Prisma 5.22, PostgreSQL). Exposes platform, tenant, device, and webhook endpoints.
3. **Jamanvaar POS Terminal:** Hybrid desktop terminal in `apps/restaurant-system/pos` (Vite / React + Tauri 2). Counter billing, offline-first ordering, and thermal printing.
4. **Jamanvaar Restaurant Admin / POS Admin:** Administrative application in `apps/restaurant-system/pos-admin` (Vite / React + Tauri 2). Manages restaurant catalog, tables, staff, and hosts guest QR ordering.
5. **Jamanvaar Kitchen Display System (KDS):** Kitchen terminal in `apps/restaurant-system/kds` (Vite / React). Displays real-time KOT tickets and status transitions.
6. **Jamanvaar Captain App:** Table management and order-taking app in `apps/restaurant-system/captain` (Vite / React / PWA).
7. **Jamanvaar Customer Kiosk (`kiosk-user`):** Self-service customer terminal in `apps/kiosk-system/kiosk-user` (Vite / React + Tauri 2 fullscreen lockdown).
8. **Jamanvaar Kiosk Admin (`kiosk-admin`):** Kiosk fleet configuration app in `apps/kiosk-system/kiosk-admin` (Vite / React + Tauri 2).
9. **LAN Local Core Services:** Local Node.js servers in `tooling/local-runtime` (`local_service.cjs` and `standalone_local_core.cjs` packaged into `JamanvaarLocalCore.exe`).

---

## 2. Component Inventory & Security Profiles

| Component | Path | Language / Framework | Entry Point | Authentication Mechanism | Authorization Model | Backend Services Consumed | Local Storage | Deployment Model | Audit Status |
|---|---|---|---|---|---|---|---|---|:---:|
| **Super Admin** | `cloud/super-admin-web` | React 18, Vite | `src/main.tsx`, `src/app/App.tsx` | Platform JWT (access in memory, refresh in httpOnly cookie) | Server-side RBAC enforced via URL regex (`access.ts`) | Cloud API (:4000) | `localStorage` (onboarding draft) | Web only | **Audited** |
| **Cloud API** | `cloud/api` | TypeScript, NestJS 10, Prisma 5.22 | `src/main.ts`, `src/app.module.ts` | Platform JWT, Tenant JWT, Device Bearer, Cashfree HMAC | NestJS Guards + PostgreSQL Row-Level Security (RLS) | Cashfree, Meta WhatsApp Cloud, MSG91, SMTP, S3 | PostgreSQL | Node.js process / Linux container | **Audited** |
| **POS Terminal** | `apps/restaurant-system/pos` | React 18, Vite, Tauri 2, Rust | `src/main.tsx`, `src-tauri/src/main.rs` | Local 4-digit PIN + Device Bearer Token | Client-side role checks + server-side DeviceAuthGuard | Cloud API, Local Core (:5178) | `localStorage` + `live_db.json` mirror | Tauri desktop application (Windows NSIS) | **Audited** |
| **Restaurant / POS Admin** | `apps/restaurant-system/pos-admin` | React 18, Vite, Tauri 2 | `src/main.tsx`, `src/App.tsx` | Tenant JWT + Device Token | Client role checks + server-side TenantAuthGuard | Cloud API | `localStorage` | Tauri desktop application | **Audited** |
| **Kitchen Display (KDS)** | `apps/restaurant-system/kds` | React 18, Vite | `src/main.tsx`, `src/App.tsx` | Device Bearer Token | Server-side DeviceAuthGuard | Cloud API, Local Core SSE | `localStorage` | Web / Electron / Browser | **Audited** |
| **Captain App** | `apps/restaurant-system/captain` | React 18, Vite | `src/main.tsx`, `src/store/captainStore.ts` | Local 4-digit PIN + Device Bearer Token | Client role checks + server-side DeviceAuthGuard | Cloud API | `localStorage` | Web / PWA | **Audited** |
| **Customer Kiosk** | `apps/kiosk-system/kiosk-user` | React 18, Vite, Tauri 2 | `src/App.tsx`, `src-tauri/src/main.rs` | Device Bearer Token (Kiosk) | Server-side DeviceAuthGuard (kiosk routes) | Cloud API, Cashfree SDK, Local Core discovery | `localStorage` | Tauri desktop (1080×1920 fullscreen) | **Audited** |
| **Kiosk Admin** | `apps/kiosk-system/kiosk-admin` | React 18, Vite, Tauri 2 | `src/App.tsx` | Tenant JWT (refresh in `localStorage`) | Server-side TenantAuthGuard + DeviceAuthGuard | Cloud API | `localStorage` | Tauri desktop application | **Audited** |
| **Local Core (Standalone)** | `tooling/local-runtime/standalone_local_core.cjs` | Node.js CommonJS | `standalone_local_core.cjs` | **None (Open / Unauthenticated)** | None | None | `%APPDATA%/JAMANVAAR/data/live_db.json` | Compiled SEA executable (`.exe`) | **Audited** |
| **Local Core (Service)** | `tooling/local-runtime/local_service.cjs` | Node.js CommonJS | `local_service.cjs` | `SERVICE_KEY` + 6-digit `PAIRING_PIN` | Pre-shared key verification | None | `packages/database/src/live_db.json` | Node.js background service | **Audited** |

---

## 3. Shared Packages (`packages/*`)

All client applications consume shared TypeScript libraries resolved via Vite aliases:
1. **`packages/types`**: Domain interfaces for orders, KOTs, tables, payments, shifts, inventory, and users.
2. **`packages/database`**: In-memory database abstraction, repository classes (`repositories.ts`), PIN hashing (`pin.ts`), and seed state (`live_db.json`).
3. **`packages/business`**: Pricing calculations (`pricing.util.ts`), license certificate verification (`license_certificate.ts`), idempotency, and chatbots.
4. **`packages/sync`**: Synchronization outbox, LAN mesh sync (`lan_mesh_sync.ts`), command pipeline (`command_pipeline.ts`), and device entitlement gate (`device_gate.ts`).
5. **`packages/api`**: ESC/POS thermal printer byte formatting and electronic receipt generation.
6. **`packages/validation`**: Zod validation schemas for forms and payloads.
7. **`packages/config`**, **`packages/utils`**, **`packages/i18n`**, **`packages/ui`**: Configuration constants, helper utilities, translation strings, and shared UI components.

---

## 4. Databases & Persistence Architecture

1. **Cloud Relational Store:** PostgreSQL via Prisma ORM 5.22. 38 models total. 19 models have PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`), and 19 models lack RLS.
2. **Local Terminal Storage:** No SQLite is used. Storage is implemented using browser `localStorage`, in-memory cache structures, and disk-persisted JSON files (`live_db.json`).
3. **Cloud Object Storage:** AWS S3-compatible storage used for tenant database snapshots and backups.

---

## 5. External Services & Third-Party Integrations

1. **Cashfree Payment Gateway:** Primary payment processor for UPI, cards, and netbanking. Cloud API receives webhook status notifications via HMAC-SHA256 signatures.
2. **Messaging & Notifications:** Meta WhatsApp Cloud API, MSG91 SMS gateway, and standard SMTP (Gmail).
3. **Third-Party CDNs & Scripts:** Google Fonts, Cashfree JavaScript SDK loaded in webviews.

---

## 6. Components Audited vs. Not Audited

- **Components Audited:** All 7 frontend applications, both Local Core runtime variants, Cloud API backend, shared packages, Prisma schema, and installer build scripts have been analyzed.
- **Components Not Audited (Environment-Level Limitations):** Hardware-level ESC/POS thermal printer serial/USB controllers, deployed live cloud reverse proxies, and third-party production Cashfree sandbox accounts (read-only audit boundary).
