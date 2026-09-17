/**
 * SQLite Relational Schema DDL for JAMANVAAR Kiosk Platform.
 *
 * NOT EXECUTED ANYWHERE. This string documents the intended shape of the
 * operational data model (menu/orders/tables/staff/CRM/inventory) that the
 * real runtime — db.ts's JamanvaarDatabase — currently implements as plain
 * in-memory JS arrays persisted via localStorage.setItem, not as SQLite.
 * There is no better-sqlite3/sql.js/Prisma-SQLite engine anywhere in this
 * package; nothing ever runs this DDL against a real database. Grep the repo
 * for `SQLITE_SCHEMA_DDL` before trusting that it does — it has exactly one
 * reference, this file's own declaration.
 *
 * The corresponding real database for this operational domain is
 * cloud/api/prisma/schema.prisma's SyncedOrder/SyncedEntity models (see
 * modules/order-sync and modules/entity-sync) — genuine Postgres tables with
 * row-level security, reachable from local apps via packages/sync's
 * SyncOutboxEngine/EntitySyncEngine. Replacing this file's local persistence
 * with a real embedded SQLite engine (meaningful mainly for the Tauri
 * desktop shell, where crash-durability and real querying would matter more
 * than they do for a browser tab) is a separate, substantial undertaking —
 * a full rewrite of db.ts's ~1800 lines and every app that imports it — not
 * attempted here.
 */

export const SQLITE_SCHEMA_DDL = `
-- Restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'INR',
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Outlets
CREATE TABLE IF NOT EXISTS outlets (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Kiosk Devices
CREATE TABLE IF NOT EXISTS kiosks (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  kiosk_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location_description TEXT,
  status TEXT DEFAULT 'ONLINE',
  order_types_allowed TEXT DEFAULT '["DINE_IN","TAKEAWAY"]',
  allow_cash_at_counter INTEGER DEFAULT 1,
  default_language TEXT DEFAULT 'en',
  idle_timeout_seconds INTEGER DEFAULT 60,
  ip_address TEXT,
  mac_address TEXT,
  app_version TEXT DEFAULT '1.0.0',
  last_heartbeat TEXT,
  last_sync_at TEXT,
  is_locked INTEGER DEFAULT 0,
  lock_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Kiosk Sessions
CREATE TABLE IF NOT EXISTS kiosk_sessions (
  session_id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL REFERENCES kiosks(id),
  outlet_id TEXT NOT NULL,
  order_type TEXT,
  table_id TEXT,
  guest_count INTEGER,
  customer_phone TEXT,
  customer_name TEXT,
  started_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  metadata TEXT
);

-- Users & Staff
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT,
  role_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT NOT NULL, -- JSON array
  is_system_role INTEGER DEFAULT 0
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  outlet_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  icon_name TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  translations TEXT -- JSON object
);

-- Modifier Groups
CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  min_selections INTEGER DEFAULT 0,
  max_selections INTEGER DEFAULT 1,
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Modifier Options
CREATE TABLE IF NOT EXISTS modifier_options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  dietary_type TEXT,
  translations TEXT -- JSON object
);

-- Tax Groups
CREATE TABLE IF NOT EXISTS tax_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cgst_percent REAL DEFAULT 2.5,
  sgst_percent REAL DEFAULT 2.5,
  igst_percent REAL DEFAULT 5.0,
  is_inclusive INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1
);

-- Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  outlet_id TEXT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  base_price REAL,
  takeaway_price REAL,
  dine_in_price REAL,
  image_url TEXT,
  dietary_type TEXT DEFAULT 'VEG',
  spice_level TEXT DEFAULT 'NONE',
  is_popular INTEGER DEFAULT 0,
  is_new INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  sold_out_reason TEXT,
  prep_time_minutes INTEGER DEFAULT 15,
  calories INTEGER,
  serving_size TEXT,
  allergens TEXT DEFAULT '[]',
  modifier_group_ids TEXT DEFAULT '[]',
  tax_group_id TEXT REFERENCES tax_groups(id),
  sort_order INTEGER DEFAULT 0,
  kitchen_station TEXT DEFAULT 'Main Kitchen',
  translations TEXT -- JSON object
);

-- Combos
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  combo_price REAL NOT NULL,
  original_price REAL,
  slots TEXT NOT NULL, -- JSON array
  is_active INTEGER DEFAULT 1,
  dietary_type TEXT DEFAULT 'VEG',
  sort_order INTEGER DEFAULT 0
);

-- Dining Tables
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL,
  table_number TEXT NOT NULL,
  capacity INTEGER DEFAULT 4,
  zone TEXT DEFAULT 'Main Hall',
  floor INTEGER DEFAULT 1,
  qr_code_url TEXT,
  status TEXT DEFAULT 'AVAILABLE',
  current_order_id TEXT,
  is_active INTEGER DEFAULT 1
);

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  min_order_value REAL DEFAULT 0,
  max_discount_amount REAL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 1,
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- Offers & Promotions
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  min_order_value REAL DEFAULT 0,
  max_discount_amount REAL,
  banner_image_url TEXT,
  is_active INTEGER DEFAULT 1,
  start_date TEXT,
  end_date TEXT,
  channel TEXT DEFAULT 'ALL'
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  token_number TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  kiosk_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL,
  table_id TEXT,
  table_number TEXT,
  guest_count INTEGER,
  customer_phone TEXT,
  customer_name TEXT,
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  coupon_code TEXT,
  cgst_amount REAL DEFAULT 0,
  sgst_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  service_charge_amount REAL DEFAULT 0,
  tip_amount REAL DEFAULT 0,
  round_off_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  payment_transaction_id TEXT,
  order_status TEXT DEFAULT 'CONFIRMED',
  estimated_wait_minutes INTEGER DEFAULT 15,
  pickup_counter TEXT DEFAULT 'Counter 1',
  is_synced INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  modifiers TEXT DEFAULT '[]', -- JSON array
  special_instructions TEXT,
  total_price REAL NOT NULL,
  kitchen_status TEXT DEFAULT 'PENDING'
);

-- Payments & Transactions
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  gateway_transaction_id TEXT,
  qr_payload TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,
  content_formatted TEXT NOT NULL,
  is_printed INTEGER DEFAULT 0,
  printed_at TEXT,
  digital_url TEXT
);

-- Service Requests (Staff Call)
CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  table_number TEXT,
  session_id TEXT,
  type TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- Device Health Telemetry
CREATE TABLE IF NOT EXISTS device_health (
  kiosk_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'ONLINE',
  is_online INTEGER DEFAULT 1,
  cpu_usage_percent REAL DEFAULT 15.0,
  ram_usage_percent REAL DEFAULT 35.0,
  storage_free_gb REAL DEFAULT 120.5,
  app_version TEXT DEFAULT '1.0.0',
  is_printer_online INTEGER DEFAULT 1,
  is_payment_terminal_online INTEGER DEFAULT 1,
  is_touchscreen_responsive INTEGER DEFAULT 1,
  last_heartbeat TEXT NOT NULL,
  pending_sync_events_count INTEGER DEFAULT 0
);

-- Sync Outbox Events
CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  status TEXT DEFAULT 'PENDING',
  retry_count INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  kiosk_id TEXT,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  details TEXT NOT NULL,
  ip_address TEXT,
  timestamp TEXT NOT NULL
);

-- App Configuration Settings
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'SYSTEM',
  updated_at TEXT NOT NULL
);

-- INDEXES for fast retrieval
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_availability ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_events(status);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
`;
