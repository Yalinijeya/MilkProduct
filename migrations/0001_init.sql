-- Database for the ordering app (Cloudflare D1 = SQLite).
-- Apply with: npm run db:migrate:local   /   npm run db:migrate:remote
-- Timestamps are ISO strings from JavaScript's toISOString(), e.g. 2026-11-26T10:15:00.000Z

CREATE TABLE items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price       REAL    NOT NULL,
  unit        TEXT    NOT NULL DEFAULT '',
  image_url   TEXT    NOT NULL DEFAULT '',   -- /uploads/<file> (the photo is stored in KV)
  available   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,  -- order number = ORD-(1000 + id)
  customer_name    TEXT    NOT NULL,
  customer_phone   TEXT    NOT NULL,
  customer_address TEXT    NOT NULL,
  customer_lat     REAL    NOT NULL,
  customer_lng     REAL    NOT NULL,
  notes            TEXT    NOT NULL DEFAULT '',
  items            TEXT    NOT NULL,                   -- JSON: [{id,itemId,name,price,quantity,lineTotal}]
  item_total       REAL    NOT NULL,
  distance_km      REAL    NOT NULL,
  delivery_charge  REAL    NOT NULL,
  grand_total      REAL    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'new',     -- new|confirmed|out_for_delivery|delivered|cancelled
  whatsapp_link    TEXT    NOT NULL DEFAULT '',
  whatsapp_sent    INTEGER NOT NULL DEFAULT 0,
  whatsapp_error   TEXT    NOT NULL DEFAULT '',
  email_sent       INTEGER NOT NULL DEFAULT 0,
  email_error      TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_updated_at ON orders (updated_at);

-- Exactly one row (id = 1). Edit it in Admin → Settings.
CREATE TABLE settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  shop_name        TEXT NOT NULL DEFAULT '',
  whatsapp_number  TEXT NOT NULL DEFAULT '',
  notify_email     TEXT NOT NULL DEFAULT '',
  shop_address     TEXT NOT NULL DEFAULT '',
  shop_lat         REAL NOT NULL DEFAULT 0,
  shop_lng         REAL NOT NULL DEFAULT 0,
  free_km          REAL NOT NULL DEFAULT 5,
  charge_per_km    REAL NOT NULL DEFAULT 50,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Login / order spam protection (requests per IP per time window).
CREATE TABLE rate_limits (
  key      TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL   -- unix ms
);

-- Default shop settings and sample products (the data import replaces these with your real data).
INSERT INTO settings (id, shop_name, whatsapp_number, notify_email, shop_address, shop_lat, shop_lng,
                      free_km, charge_per_km, created_at, updated_at)
VALUES (1, 'Uthaya Milk Products Industry (Pvt) Ltd Online Shopping Center', '94770798107', '',
        'Urumpirai East, Jaffna', 9.72, 80.04, 5, 50,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO items (name, unit, price, description, created_at, updated_at) VALUES
  ('Full Cream Milk', '1 L',    68,  'Fresh farm full cream milk', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Toned Milk',      '500 ml', 28,  'Everyday toned milk',        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Curd',            '500 g',  45,  'Thick homemade-style curd',  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Paneer',          '200 g',  95,  'Soft fresh paneer',          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Ghee',            '500 ml', 340, 'Pure cow ghee',              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
