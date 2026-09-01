# JAMANVAAR Kiosk System Architecture

## 1. System Overview

The **JAMANVAAR Kiosk System** is an enterprise-grade, offline-first self-ordering restaurant kiosk platform engineered for high-throughput dining environments. It comprises two desktop applications built with a shared core:

1. **JAMANVAAR KIOSK ADMIN** (`/apps/kiosk-admin`): Desktop management control plane for restaurant owners, managers, and cashiers to manage menus, categories, modifiers, combos, pricing tiers, taxes, offers, coupons, tables, order types, payment gateways, thermal printers, staff RBAC, device health, sync engine, reports, analytics, and audit logs.
2. **JAMANVAAR KIOSK USER / CUSTOMER** (`/apps/kiosk-user`): Touch-first, restricted-execution self-ordering kiosk application with guest ordering, dine-in/takeaway modes, visual rich menus, modifier customization, cart validation, combo builders, loyalty/coupons, payment state machine (UPI, Card terminal, Cash-at-counter), token generation, live order status tracking, staff call assistance, and automatic session isolation.

Both applications share a centralized package architecture under `/shared`:
- `/shared/ui`: JAMANVAAR Design System (tokens, buttons, cards, modals, tables, badges, toast, forms)
- `/shared/types`: Full TypeScript domain contracts, entities, DTOs, and state schemas
- `/shared/database`: SQLite database schema, migrations, repositories, and seed engine
- `/shared/validation`: Zod validation schemas for all domain entities, carts, and transactions
- `/shared/business`: Pricing, tax calculation, modifier rules, cart validation, idempotency engine
- `/shared/sync`: Offline-first outbox/inbox sync engine with conflict resolution and deterministic state replay
- `/shared/config`: Application constants, feature flags, device identity, environment configurations
- `/shared/i18n`: Multilingual support (English, Hindi, Gujarati) with zero hard-coded strings
- `/shared/utils`: Formatting, currency, UUIDs, cryptographic hashing, time utilities
- `/shared/api`: Hardware & service abstraction layer (PaymentService, PrinterService, KdsService, PosService, DeviceHealthService)

---

## 2. Technology Stack

- **Desktop Framework**: Tauri 2.x (Rust core + Webview2 frontend runtime for minimal memory footprint and native Windows lockdown/printing/hardware access)
- **Frontend Core**: React 18 / 19 + TypeScript (Strict Mode)
- **Styling & Design System**: Tailwind CSS v3 configured with official JAMANVAAR design tokens (`#0B253A` Navy, `#E66817` Saffron Orange, `#FBF9F5` Ivory Surface, `#00A99D` Teal, `#16A34A` Emerald)
- **State Management**: Zustand lightweight reactive stores with persistence middleware and cross-tab/IPC synchronization
- **Form Management**: React Hook Form + Zod resolvers
- **Local Database**: SQLite with robust relational schemas, foreign keys, triggers, indexes, and write-ahead logging (WAL mode)
- **Realtime / IPC**: Tauri IPC event bridge + WebSocket abstraction for KDS/POS/Captain mesh updates
- **Hardware Layer**: Pluggable Hardware Abstraction Layer (HAL) for ESC/POS thermal printers, UPI dynamic QR display, Smart POS card terminals, and touch input guards

---

## 3. Visual Design System & Brand Identity

### Design Tokens
- **Background**: Ivory / Warm Cream (`#FBF9F5`, `#F3EFE6`)
- **Primary / Brand Navy**: Deep Marine Navy (`#0B253A`, `#0C2B42`, `#133E5E`)
- **Accent / Saffron Gold**: Warm Restaurant Saffron (`#E66817`, `#F27A2B`, `#D1560D`)
- **Teal / Cyan Sub-module**: (`#00A99D`, `#0E7490`)
- **Surfaces**: Clean Elevated White (`#FFFFFF`) with border (`#E5DFD3`)
- **Semantic Colors**:
  - Success / Veg / Online: Emerald Green (`#16A34A`)
  - Error / Non-Veg / Disconnected: Vivid Crimson (`#DC2626`)
  - Warning / Pending / Jain: Amber Ocher (`#D97706` / `#B45309`)
- **Typography**: Inter / Plus Jakarta Sans / Outfit for ultra-crisp readability on commercial touchscreens and 4K displays.
- **Logo Integration**: Official JAMANVAAR by Kelviontech identity asset integrated across welcome, header, confirmations, and receipts.

---

## 4. Offline-First & Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN CONTROL PLANE                      │
│   (Menu, Modifiers, Pricing, Taxes, Coupons, Kiosk Config)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      LOCAL SQLITE DB                        │
│   (Menu Catalog, Active Prices, Outbox Events, Orders)      │
└──────────────┬───────────────────────────────▲──────────────┘
               │ Local Cached Read             │ Sync Outbox / Local Writes
               ▼                               │
┌──────────────────────────────────────────────┴──────────────┐
│                    CUSTOMER KIOSK APP                       │
│ (Touch Menu -> Modifiers -> Cart -> Payment -> Token & KOT) │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │ KDS KITCHEN  │   │ CAPTAIN APP  │   │ COUNTER POS  │
     │ (Live KOT)   │   │(Table Orders)│   │(Consolidated)│
     └──────────────┘   └──────────────┘   └──────────────┘
```

### Deterministic Conflict Resolution:
1. **Menu & Pricing Updates**: Admin/Cloud authority wins upon sync timestamp.
2. **Item Stock / Sold Out**: Kiosk immediately disables ordering for items marked out of stock.
3. **Order Creation & Payments**: Strict client-generated UUID `idempotency_key` preventing duplicate KOTs or transactions across offline retries and app restarts.
4. **Payment Transactions**: Payment provider gateway state is authoritative.

---

## 5. Security & Kiosk Lockdown

1. **Restricted Shell**: Window pinning, fullscreen mode, disabling F12 devtools, context menu suppression, and alt+key navigation interception in kiosk user app.
2. **Session Isolation**: Automatic idle timeout countdown (configurable 30s-120s) resetting all cart, phone numbers, loyalty state, and payment buffers immediately upon cancellation or completion. Zero residual memory leakage.
3. **No Secret Storage**: Secure token handling with no plaintext payment credentials stored in SQLite.

---

## 6. Implementation Directory Structure

```
/
├── apps/
│   ├── kiosk-admin/          # React + Vite + Tauri Admin App
│   │   ├── src/
│   │   │   ├── components/   # Admin Dashboard, Menu CRUD, Tables, Orders, Hardware
│   │   │   ├── pages/        # Dashboard, Menu, Orders, Pricing, Taxes, Kiosks, Reports
│   │   │   ├── store/        # Admin Zustand state stores
│   │   │   └── App.tsx
│   │   └── src-tauri/        # Tauri Rust desktop backend for Admin
│   │
│   └── kiosk-user/           # React + Vite + Tauri Customer Touch App
│       ├── src/
│       │   ├── components/   # Welcome, Menu Grid, Item Modal, Cart, Checkout, Token
│       │   ├── pages/        # Welcome, Mode Select, Menu, Cart, Payment, Tracking
│       │   ├── store/        # User session & cart Zustand stores
│       │   └── App.tsx
│       └── src-tauri/        # Tauri Rust desktop backend with Kiosk lockdown & HAL
│
├── shared/
│   ├── ui/                   # Reusable JAMANVAAR Design System Components
│   ├── types/                # Domain models, Enums, DTOs
│   ├── database/             # SQLite schema, migrations, query repositories
│   ├── validation/           # Zod validation schemas
│   ├── business/             # Tax calculation, modifier validation, combo engine
│   ├── sync/                 # Sync outbox engine, network monitor
│   ├── config/               # System defaults, theme tokens, hardware configs
│   ├── i18n/                 # English, Hindi, Gujarati translation dictionaries
│   ├── utils/                # Currency, math, formatting, hashing
│   └── api/                  # Payment HAL, Printer HAL, KDS/POS Mesh HAL
│
├── docs/                     # Full technical documentation suite
└── package.json              # Monorepo workspace configuration
```
