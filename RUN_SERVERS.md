# 🚀 JAMANVAAR Server Launch & Developer Guide

This document contains all instructions, commands, port mappings, and default credentials required to run all applications and backend services in the **JAMANVAAR Restaurant Operating System** monorepo.

---

## ⚡ Quick Start (1-Command Launch)

### 1. Launch All Servers Concurrently (Cloud + All Terminals)
Run the entire platform (Cloud API, Super Admin, Restaurant Admin, POS, Captain, KDS, Kiosk, Kiosk Admin, and LAN Sync):

```bash
npm run dev:all
```

Or double-click `start-all-servers.bat`.

---

### 🛑 Stop All Servers
To cleanly close and release all ports (`4000`, `5173-5180`, `3000`, `8000`):

```bash
npm run stop
```

Or double-click `stop-all-servers.bat`.

---

### 2. Launch by Platform Sub-System

If you only want to work on a specific part of the ecosystem:

| Target Environment | NPM Command | What It Runs |
| :--- | :--- | :--- |
| **Cloud SaaS Suite** | `npm run dev:cloud` | Cloud API (`:4000`) + Super Admin Web (`:5180`) |
| **Restaurant Terminal Suite** | `npm run dev` | POS Admin, POS, Captain, KDS, Kiosk, Kiosk Admin, LAN Sync |
| **Cloud API Only** | `npm run dev:cloud-api` | NestJS + Prisma Backend (`:4000`) |
| **Super Admin Web Only** | `npm run dev:super-admin` | Super Admin Web Console (`:5180`) |
| **Restaurant Admin Only** | `npm run dev:pos-admin` | Restaurant Admin Web App (`:5176`) |
| **POS Counter Only** | `npm run dev:pos` | Cashier & Table Billing Terminal (`:5175`) |
| **Captain App Only** | `npm run dev:captain` | Waiter Table Ordering App (`:5177`) |
| **Kitchen Display (KDS)** | `npm run dev:kds` | Kitchen Order Display Terminal (`:5179`) |
| **Customer Touch Kiosk** | `npm run dev:kiosk` | Self-Ordering Touchscreen Kiosk (`:5174`) |
| **Kiosk Fleet Admin** | `npm run dev:kiosk-admin` | Kiosk Standee Manager (`:5173`) |
| **LAN Sync Engine** | `npm run dev:sync` | Local Offline-First Mesh Bridge (`:5178`) |

---

## 🌐 Complete Server Matrix & Port Guide

| Application / Service | Port | URL | Primary Role |
| :--- | :---: | :--- | :--- |
| **Super Admin Web** | `5180` | [http://localhost:5180](http://localhost:5180) | Multi-tenant SaaS control center, onboarding, subscriptions, fleet MDM, master catalog |
| **Cloud API Gateway** | `4000` | [http://localhost:4000](http://localhost:4000) | Core NestJS backend, PostgreSQL ORM, authentication, sync observability |
| **Restaurant Admin (POS Admin)** | `5176` | [http://localhost:5176](http://localhost:5176) | Restaurant manager portal, menu editing, branch config, reports, staff management |
| **POS Billing System** | `5175` | [http://localhost:5175](http://localhost:5175) | High-speed billing, dine-in floorplan, split payments, thermal receipts |
| **Captain Mobile/Tablet** | `5177` | [http://localhost:5177](http://localhost:5177) | Waiter order taking, table service status, KOT dispatch |
| **Kitchen Display System (KDS)** | `5179` | [http://localhost:5179](http://localhost:5179) | Real-time kitchen stations, prep timers, order bumping |
| **Customer Touch Kiosk** | `5174` | [http://localhost:5174](http://localhost:5174) | Self-ordering touchscreen kiosk for customers with modifiers & combos |
| **Kiosk Admin** | `5173` | [http://localhost:5173](http://localhost:5173) | Kiosk standee fleet management, visual themes, terminal pairing |
| **LAN Sync Runtime Server** | `5178` | [http://localhost:5178](http://localhost:5178) | Local restaurant network service bridge (offline synchronization) |

---

## 🔑 Credentials & Access

There are **no hardcoded default passwords** anywhere in this codebase — every
platform/tenant login credential is either generated randomly at seed time
(and printed once, never stored) or set explicitly by you via an env var
passed to the seed script. This is deliberate (see SEC-011 in
`platform-auth.service.ts`): a login screen that accepts a well-known
published password, or that accepts *any* password outside production, is a
real account-takeover vector, not a convenience — a previous version of this
doc and of `platform-auth.service.ts` did exactly that and both were removed.

### 1. Super Admin Web Console (`http://localhost:5180`)
* **Email**: `superadmin@jamanvaar.app` (or `SEED_SUPER_ADMIN_EMAIL` if you set one)
* **Password**: whatever the seed script printed when the account was first
  created — it is shown exactly once and never stored anywhere, including
  this file. If you don't have it, rotate it (see *Resetting Credentials*
  below) rather than guessing.
* **Permissions**: Full platform control (tenants, subscriptions, licenses, master catalog, MDM)

### 2. Restaurant Admin / Captain / POS Login (`http://localhost:5176` / `5177` / `5175`)
* **First-Time Activation Flow** (a real, newly-invited owner):
  1. The owner receives a one-time activation token (printed by the seed
     script for the demo restaurant, or emailed in a real deployment).
  2. They redeem it via `POST /api/v1/tenant-auth/set-initial-password`
     (`restaurantId`, `email`, `activationToken`, `newPassword`), which sets
     their real password and activates the account.
  3. From then on they log in with **Restaurant ID + Email + Password**.
* **For local dev/testing**, skip the token dance entirely by seeding the
  demo owner directly into an active state — see *Local Dev Credentials*
  below.

---

## 💻 Manual Mode: Running in Separate Terminal Tabs

If you prefer dedicated terminal windows for clean, isolated logging:

### Terminal 1: Cloud API (Backend)
```bash
npm run dev:cloud-api
```
*Expected output: `JAMANVAAR cloud API listening on :4000`*

### Terminal 2: Super Admin Web (Frontend)
```bash
npm run dev:super-admin
```
*Expected output: `Local: http://localhost:5180/`*

### Terminal 3: Restaurant Admin (POS Admin)
```bash
npm run dev:pos-admin
```
*Expected output: `Local: http://localhost:5176/`*

### Terminal 4: POS Billing Terminal
```bash
npm run dev:pos
```
*Expected output: `Local: http://localhost:5175/`*

### Terminal 5: Captain App
```bash
npm run dev:captain
```
*Expected output: `Local: http://localhost:5177/`*

### Terminal 6: Kitchen Display System (KDS)
```bash
npm run dev:kds
```
*Expected output: `Local: http://localhost:5179/`*

### Terminal 7: Customer Kiosk
```bash
npm run dev:kiosk
```
*Expected output: `Local: http://localhost:5174/`*

### Terminal 8: Local LAN Sync Server
```bash
npm run dev:sync
```
*Expected output: `JAMANVAAR local restaurant service listening on :5178`*

---

## 🗄️ Database & Environment Requirements

### PostgreSQL Connection
* The Cloud API requires PostgreSQL running on port `5432`.
* Copy `cloud/api/.env.example` to `cloud/api/.env` and fill in real values —
  it is the authoritative template (kept in sync with
  `src/config/env.validation.ts`, which fails startup fast if a required
  var is missing or too weak). Do not copy connection strings or secrets
  out of this document instead; the two can drift and this one isn't
  validated against the schema. In particular:
  - `DATABASE_URL` needs your own Postgres user/password, not a shared example.
  - `JWT_ACCESS_SECRET` (not `JWT_SECRET`) must be a real random 32+ character
    value — the `.env.example` header comment shows a one-liner to generate one.

### Database Migrations & Seeding
If setting up on a fresh machine or after schema modifications:
```bash
# Apply migrations
npm run prisma:deploy --workspace=@jamanvaar/cloud-api

# Seed plans + Super Admin (random password, printed once — copy it before it scrolls away)
npm run seed --workspace=@jamanvaar/cloud-api
```

#### Local Dev Credentials (opt-in, never committed anywhere)

To get a **known** Super Admin password instead of a random printed one —
useful the first time you seed a fresh database — set
`SEED_SUPER_ADMIN_PASSWORD` before seeding. It only takes effect when the
account doesn't exist yet:
```bash
# cloud/api/.env, or inline on the command:
SEED_SUPER_ADMIN_PASSWORD='choose-your-own-password' npm run seed --workspace=@jamanvaar/cloud-api
```

To exercise Restaurant Admin / Captain / POS login without walking through
the invitation-token flow, activate the seeded demo owner directly with a
password of your choosing:
```bash
SEED_DEMO_OWNER_PASSWORD='choose-your-own-password' npm run seed --workspace=@jamanvaar/cloud-api
```
This prints the demo restaurant's `restaurantId` alongside the email and
password you chose — Captain's and POS's one-time "connect this device"
screen wants all three.

---

## 🛠️ Verification & Production Builds

```bash
# Typecheck Cloud API
npm run typecheck --workspace=@jamanvaar/cloud-api

# Build Super Admin Web for production
npm run build --workspace=@jamanvaar/super-admin-web

# Build all applications
npm run build
```

---

## ❓ Troubleshooting & FAQs

### Port Already In Use
If a port (e.g. `4000` or `5180`) is blocked by a previous background process on Windows:
```powershell
# Find process using port 4000 or 5180
netstat -ano | findstr :4000
netstat -ano | findstr :5180

# Kill process by PID (replace <PID> with the number from the last column)
taskkill /F /PID <PID>
```

### Resetting Credentials
Both resets are explicit double opt-ins — the seed script will not touch an
existing password unless you set **both** the password and its matching
"allow reset" flag, so re-running seed on a real deployment can never
silently clobber a live credential:
```bash
# Rotate Super Admin's password to one you choose:
SEED_SUPER_ADMIN_PASSWORD='new-password' SEED_RESET_SUPER_ADMIN_PASSWORD=true \
  npm run seed --workspace=@jamanvaar/cloud-api

# Rotate (or activate, if still pending) the demo restaurant owner's password:
SEED_DEMO_OWNER_PASSWORD='new-password' SEED_RESET_DEMO_OWNER_PASSWORD=true \
  npm run seed --workspace=@jamanvaar/cloud-api
```
Each prints the new password once on success — that is the only place it is
ever shown.

---

<div align="center">
  <sub>© 2026 JAMANVAAR by KELVIONTECH. All rights reserved.</sub>
</div>
