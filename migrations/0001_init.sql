-- Initial schema for G2 TopUp (Cloudflare D1 / SQLite).
-- Kept byte-for-byte compatible with src/lib/schema.ts, which re-applies the same
-- idempotent statements at boot so a fresh deploy works even without this migration.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts (key, created_at);

CREATE TABLE IF NOT EXISTS games (
  code TEXT PRIMARY KEY,
  g2_id INTEGER,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  servers_json TEXT NOT NULL DEFAULT '{}',
  visible INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_denoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL,
  g2_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  price_override INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  UNIQUE (game_code, g2_name)
);
CREATE INDEX IF NOT EXISTS idx_game_denoms_game ON game_denoms (game_code, sort_order);

CREATE TABLE IF NOT EXISTS gift_products (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER,
  category_title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  cost_cents INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  price_override INTEGER NOT NULL DEFAULT 0,
  face_value REAL,
  stock INTEGER NOT NULL DEFAULT -1,
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_products_cat ON gift_products (category_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  item_ref TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_image TEXT NOT NULL DEFAULT '',
  denom_ref TEXT NOT NULL,
  denom_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  account_json TEXT NOT NULL DEFAULT '{}',
  player_name TEXT,
  customer_contact TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',

  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_ref TEXT NOT NULL,
  aba_tx_id TEXT,
  aba_checkout_url TEXT,
  paid_at TEXT,

  fulfill_status TEXT NOT NULL DEFAULT 'PENDING',
  supplier_order_id TEXT,
  delivery_json TEXT,
  supplier_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders (payment_status, fulfill_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_ref ON orders (payment_ref);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id, id);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL
);
