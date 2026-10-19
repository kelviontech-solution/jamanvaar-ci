# Verified application and service inventory

Baseline and concurrent-edit limitations: [BASELINE.md](BASELINE.md). Versions below are repository declarations, not assertions that they are the latest releases.

## Applications

| Experience | Actual source / entry | Stack and packaging | Authentication / responsibilities | Main dependencies and status |
| --- | --- | --- | --- | --- |
| Super Admin | `cloud/super-admin-web/src`; React entry and protected layout | React 18, TypeScript, Vite 6; nginx/Docker web deployment | Platform JWT issuer/audience, emailed OTP, refresh cookie, server area RBAC; restaurant/plan/device/fleet/billing/backup control | `/platform-auth`, restaurants, plans, subscriptions, application entitlements, devices, reports, backups, jobs. Implemented; report/restore defects remain. |
| Restaurant/POS Admin | `apps/restaurant-system/pos-admin/src/App.tsx` | React/Zustand; web and Tauri v2 | Owner/manager login plus activated device identity; staff proof for sensitive changes; manages catalogue, branch operations, finance and products | Shared database/business/sync/UI packages; tenant/device/entity/menu/operations/payment endpoints. Implemented; full authenticated UI not freshly traversed in this audit. |
| Kiosk Admin | Product experience within the same `pos-admin` application | Shared admin bundle and console product scope; not a separate sixth native application | Licensed owner console and kiosk-specific navigation/configuration | Shared menu/configuration, welcome designs, terminal enrolment and receipt/payment settings. Implemented, not a separate data authority. |
| Dedicated QR Admin / QR product website | `pos-admin/qr.html`, QR console/product components | Additional Vite entry in the shared admin build | QR-only owner login/activation and entitlements; also embeddable under a bundled owner console | `/qr/`, `/qr/login/`, `/qr/admin/`; `/restaurant/qr/*`, QR page/features/CRM. Implemented. Current mobile login entry inspected; authenticated features require separate acceptance. |
| POS terminal | `apps/restaurant-system/pos/src/main.tsx`, `store/posStore.ts` | React/Zustand; Tauri Windows/Android, web | Activated device plus cashier/staff session; menu, carts, KOT, collection, shifts and receipts | Local SQLite/OPFS or fallback storage; cloud order/entity/inventory sync; local Core and printer adapters. Implemented; durable-ack gap and evolving cart contract remain. |
| Customer Kiosk | `apps/kiosk-system/kiosk-user/src/App.tsx` | React; Tauri Windows/Android and web | Activated kiosk; customer journey with staff authorization for privileged actions | Cloud priced payments, local draft/order storage, shared receipts, configuration sync. Implemented; runtime physical payment/printing and native restart acceptance not repeated. |
| Captain | `apps/restaurant-system/captain/src/main.tsx`, `store/captainStore.ts` | React/Zustand; Tauri Windows/Android | Device activation and staff session; tables, courses, KOT, serving and bill requests | Shared local repositories, order sync, floor/service messages. Implemented; direct-add validation gap reproduced. |
| KDS | `apps/restaurant-system/kds/src/App.tsx`, ticket/expo components | React; Tauri Windows/Android | Activated device and kitchen staff; station queues, ready/served progress | Shared KOT/order projection, cloud cursor pulls, SSE wake-ups and local messages. Implemented; actual multi-device service lifecycle not repeated here. |
| Customer QR | `apps/qr-guest/src/App.tsx` | React/Vite web; not a native package | Public table token plus signed guest/browser proof; menu, quote, cart, checkout and tracking | `/api/v1/public/qr/*`; shared visual components; Razorpay checkout. Implemented; prior ordering fixes exist in current source, but live provider and complete current guest journey are not certified. |

Five native identities remain distinct: `com.jamanvaar.pos`, Restaurant Admin, Captain, KDS and Kiosk identities in their respective `src-tauri/tauri.conf.json`. POS config version is 1.0.4. The shared Kiosk/QR admin experiences must not be mistaken for additional independently built binaries.

## Shared infrastructure

| Component | Source | Role and evidence |
| --- | --- | --- |
| Central API | `cloud/api/src` | NestJS 11; Prisma 5.22; PostgreSQL. 82 `*controller.ts` files plus plural controller files; AST inventory captures **527 HTTP/SSE declarations**, not 527 manually tested endpoints. |
| Database | `cloud/api/prisma/schema.prisma`, `migrations` | 65 Prisma models, 101 SQL migrations. Production Compose declares PostgreSQL 15; CI declares 16. Fresh migration chain succeeded locally. |
| Tenant boundaries | Prisma context wrappers, device/tenant/platform guards, branch-license helpers | Restaurant RLS, branch membership constraints and server product/role checks. 43 of 45 tables with `restaurantId` have forced RLS; AuditLog and PlatformNotification are platform-controlled exceptions. |
| Local persistence | `packages/database/src/durable/*` | SQLite WASM worker/OPFS, clustered leader/follower coordination, batched writes; falls back to localStorage when browser prerequisites are absent. This is not a synchronous native transaction API. |
| Shared domain | `packages/business`, `utils`, `types`, `validation` | Pricing, money, cart/modifier rules, plan contracts, roles and schemas. Some backend/domain logic remains separately implemented. |
| Synchronization | `packages/sync/src` | Order outbox, cursor/inbox catch-up, retry/dead-letter state, entity/menu/floor/inventory sync, device gate and update commands. |
| Branch Core | `packages/branch-core/src` | Node/SQLite operational LAN server, authenticated branch binding, uplink, supervision, backup and optional TLS. Built through tooling rather than a workspace package.json. |
| Legacy local bridge | `tooling/local-runtime/local_service.cjs`, `sync_server.cjs` | Additional authenticated JSON/HTTP local service on port 5178. Distinguish from Branch Core and from in-browser BroadcastChannel “LAN mesh”. |
| Realtime | `cloud/api/src/common/realtime`, `packages/sync/src/realtime_client.ts` | SSE to devices; PostgreSQL LISTEN/NOTIFY across API processes; payload-light wake-ups followed by authoritative pulls. Browser BroadcastChannel is same-origin/window messaging, not networking between physical machines. |
| Payments | `cloud/api/src/modules/payments` | Razorpay server integration, gateway attempt shell, callbacks/webhooks, refunds, shared canonical order/payment allocations. Platform subscription invoices/payments are a different financial domain. |
| Printing | `packages/api/src/printer.ts`, `packages/native/printing.rs`, app printer services | Durable local job records and platform adapters; network/installed/serial printer support. Real hardware delivery remains unverified in this audit. |
| External messaging | email service, WhatsApp inbound/outbound modules | SMTP timeouts, signed service/webhook requests, leased retry delivery. No actual outbound message was sent. |
| Deployment/releases | Compose, nginx, Dockerfiles, `.github/workflows` | Web/API containers; guarded CI/native release workflows, updater signatures, Windows signing and Android identity verification tooling. Signing runner availability and installed upgrades were not tested. |

## Contracts and ownership

The machine-readable [route inventory](ROUTE_INVENTORY.json) records controller, method, line and declared guards. It does not infer that a route without a decorator is unprotected: service checks, signatures and global guards may apply. Authenticated device scope is distinct from a client-supplied restaurant/branch filter.

Domain dependencies: onboarding → subscription/catalog entitlement → branch license → activation/device identity → tenant-bound data APIs → local durable state → order sync/QR admission → canonical SyncedOrder → payment allocation and kitchen projections → reporting/operations.

## Code quality and dead-code candidates

- Large, tightly coupled modules remain: Kiosk App, POS/Captain stores, shared repositories, QR services and operation services. Exact source hashes/line counts are in [SOURCE_SNAPSHOT.json](SOURCE_SNAPSHOT.json). Extract pure business contracts before adding further app-specific copies.
- `get_local_core_info` is an exposed Rust command returning constant RUNNING/version/port, with no TypeScript caller found in this review. Treat as an obsolete/misleading interface candidate, not proven safe to delete.
- There are multiple local service, discovery and pairing implementations. Document which is shipped and retire alternatives only after installer and recovery compatibility tests.
- Placeholder/TODO text or a mock in an isolated test was not treated as a production defect. The limited tracked-text indicator scan found no matching private-key headers, AWS access-key patterns, GitHub token patterns or Razorpay key patterns, and no tracked `.env` file. It was not a complete historical secret scan.
- Root `npm test` runs a photo synchronization prehook. The audit invoked Vitest directly to avoid that asset mutation. A test writes an older PERFORMANCE.json; that is an execution artifact, not a production measurement.
