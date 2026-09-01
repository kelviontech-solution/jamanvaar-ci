# JAMANVAAR Database Documentation

## 1. Relational Database Overview

The JAMANVAAR platform uses **SQLite** as its local primary store to achieve zero-latency read performance, instant UI feedback on commercial touchscreens, and uninterrupted offline dining operations.

### Key Architecture Highlights:
- **Relational Integrity**: Foreign key constraints, compound indexes, and cascades.
- **Idempotency Guarantees**: Strict unique constraints on `orders.idempotency_key`, `payment_transactions.idempotency_key`, and `sync_events.id`.
- **Zero Sensitive Data Storage**: Plaintext payment credentials and full card numbers are never written to disk.

---

## 2. Entity Relational Model

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   restaurants   │◄──────┤     outlets     │◄──────┤     kiosks      │
└─────────────────┘       └────────┬────────┘       └────────┬────────┘
                                   │                         │
                                   ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   categories    │       │     tables      │       │ kiosk_sessions  │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   menu_items    │──────►│     orders      │◄──────┘   sync_events   │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│ modifier_groups │       │   order_items   │
└────────┬────────┘       └─────────────────┘
         │
         ▼
┌─────────────────┐
│ modifier_options│
└─────────────────┘
```

---

## 3. Core Tables Specification

### `restaurants`
Stores restaurant brand identities and tax registration.
- `id` (TEXT, PK): Unique UUID
- `name` (TEXT): Brand name (e.g. `JAMANVAAR`)
- `legal_name` (TEXT): Registered company entity
- `gstin` (TEXT): State GST identification number
- `logo_url` (TEXT): Path to brand asset

### `outlets`
Stores physical restaurant branch locations.
- `id` (TEXT, PK)
- `restaurant_id` (TEXT, FK -> `restaurants.id`)
- `code` (TEXT, UNIQUE): E.g. `AHM-01`
- `city` (TEXT), `state` (TEXT), `phone` (TEXT)

### `kiosks`
Registers physical touchscreen terminals.
- `id` (TEXT, PK)
- `kiosk_code` (TEXT, UNIQUE): E.g. `KIOSK-01`
- `status` (TEXT): `ONLINE` | `OFFLINE` | `MAINTENANCE` | `LOCKED`
- `order_types_allowed` (TEXT JSON): `["DINE_IN", "TAKEAWAY"]`
- `idle_timeout_seconds` (INTEGER): Default 60s
- `is_locked` (INTEGER): 0 or 1

### `categories`
- `id` (TEXT, PK)
- `name` (TEXT): E.g. `Starters & Quick Bites`
- `slug` (TEXT, UNIQUE)
- `sort_order` (INTEGER)
- `icon_name` (TEXT)

### `menu_items`
- `id` (TEXT, PK)
- `category_id` (TEXT, FK -> `categories.id`)
- `sku` (TEXT, UNIQUE): E.g. `HBK`, `CC`, `C65`
- `name` (TEXT), `description` (TEXT)
- `price` (REAL)
- `dietary_type` (TEXT): `VEG` | `NON_VEG` | `JAIN`
- `spice_level` (TEXT): `NONE` | `MILD` | `MEDIUM` | `SPICY`
- `is_available` (INTEGER): 1 (Active) or 0 (Sold Out / 86)
- `modifier_group_ids` (TEXT JSON)
- `kitchen_station` (TEXT): E.g. `Main Kitchen`, `Tandoor`

### `orders`
- `id` (TEXT, PK)
- `order_number` (TEXT): E.g. `ORD-43`
- `token_number` (TEXT): E.g. `101`
- `idempotency_key` (TEXT, UNIQUE)
- `order_type` (TEXT): `DINE_IN` | `TAKEAWAY`
- `table_number` (TEXT, NULLABLE)
- `subtotal` (REAL), `discount_amount` (REAL)
- `cgst_amount` (REAL), `sgst_amount` (REAL), `total_amount` (REAL)
- `payment_method` (TEXT): `UPI_QR` | `CARD_TERMINAL` | `CASH_AT_COUNTER`
- `payment_status` (TEXT): `SUCCESS` | `PENDING` | `FAILED`
- `order_status` (TEXT): `CONFIRMED` | `PREPARING` | `READY` | `COLLECTED`

---

## 4. Indexing & Query Optimizations

The database schema includes explicit compound indexes for sub-millisecond retrieval:
- `idx_menu_category` on `menu_items(category_id)`
- `idx_menu_availability` on `menu_items(is_available)`
- `idx_orders_status` on `orders(order_status)`
- `idx_orders_created` on `orders(created_at DESC)`
- `idx_sync_status` on `sync_events(status)`
