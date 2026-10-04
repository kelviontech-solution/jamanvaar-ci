# Application & Component Inventory (verified)

Reconciled against actual repository structure at `9ddb5633c4679a295dfaa25a80a18dbc7912a82b`, not against the product's marketing description. Replaces the old (deleted) inventory file.

## Client applications (7, matches the brief's expected count)

| # | Application | Path | Stack | Auth | Audited in |
|---|---|---|---|---|---|
| 1 | POS Terminal | `apps/restaurant-system/pos` | React/Vite + Tauri 2 (Rust) | Local PIN + device bearer token | `pos.md` |
| 2 | Restaurant/POS Admin | `apps/restaurant-system/pos-admin` | React/Vite + Tauri 2 (Rust) | Tenant JWT (login) + device bearer token; also hosts Guest QR ordering | `pos-admin.md` |
| 3 | Kitchen Display System (KDS) | `apps/restaurant-system/kds` | React/Vite (plain web, no native shell) | Device bearer token + local PIN | `kds-captain.md` |
| 4 | Captain (floor service) | `apps/restaurant-system/captain` | React/Vite (plain web, no native shell) | Device bearer token + local PIN | `kds-captain.md` |
| 5 | Customer Kiosk | `apps/kiosk-system/kiosk-user` | React/Vite + Tauri 2 (Rust) | Device bearer token (single-step activation, no staff login) | `kiosk.md` |
| 6 | Kiosk Admin | `apps/kiosk-system/kiosk-admin` | React/Vite + Tauri 2 (Rust) | Tenant JWT (login) + device bearer token | `kiosk.md` |
| 7 | Super Admin | `cloud/super-admin-web` | React/Vite (web) | Platform JWT (access in memory, refresh in httpOnly cookie) | `super-admin-web.md` |

## Backend / shared services

| Component | Path | Stack | Audited in |
|---|---|---|---|
| Cloud API | `cloud/api` | NestJS 10 + Prisma 5 + PostgreSQL (Row-Level Security) | `api-auth.md`, `api-license-billing.md`, `api-device-sync.md`, `api-data.md` |
| Local LAN runtime — **two divergent implementations** (see `CRIT-03` in `FINDINGS.md`) | `tooling/local-runtime/{local_service.cjs, standalone_local_core.cjs}` | Node.js HTTP server, port 5178 | `local-core-packages.md` |
| Shared packages | `packages/{api,business,config,database,i18n,native,sync,types,ui,utils,validation}` | TypeScript, consumed by all 7 client apps | Read across every client-app slice as trust-boundary context; `local-core-packages.md` for `database`/`sync` specifically |
| Installers / packaging | `tooling/installers/*`, `.github/workflows/tauri-build.yml` | PowerShell/Node build scripts, NSIS, GitHub Actions | `supply-chain-secrets.md` |

## Correction to the brief's assumed architecture

The audit brief listed an eighth possible app, "POS Admin," as distinct from "Restaurant Admin." In the actual repository these are the same application (`apps/restaurant-system/pos-admin`) — there is no separate "POS Admin" console. The seven applications above are the complete, verified set; nothing was found unaccounted for.

## Data stores

- **PostgreSQL** (cloud) — 44 Prisma models, 21 of them tenant-linked with Row-Level Security enabled and forced; 13 tenant-linked tables without RLS (see `FINDINGS.md` LOW-06). Schema at `cloud/api/prisma/schema.prisma`.
- **Local JSON store per terminal** (`packages/database/src/db.ts` + `live_db.json`) — the actual runtime persistence for every client app is a browser-`localStorage`-backed JS object, not SQLite as some internal docs still describe (see `FINDINGS.md`'s old-audit disposition, F-045).
- **LAN service DB file** (`packages/database/src/live_db.json`, shared by the local runtime) — tracked in git with plaintext demo PINs; copied into installer builds.

## External integrations found in source

Razorpay (payments, sandbox/production toggle via env), MSG91 + Meta WhatsApp Cloud (SMS/WhatsApp receipts), SMTP (transactional email, optional), S3-compatible storage (backups, optional — any of AWS S3/R2/B2/MinIO), Google Fonts (runtime CSS import in several frontends, no SRI).
