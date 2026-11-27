-- Stock per item + shop opening hours.
-- Apply with: npm run db:migrate:local   /   npm run db:migrate:remote

-- NULL = stock not tracked (unlimited). The CHECK makes an order fail (and roll back) instead of
-- letting the stock go below zero when two customers buy the last items at the same moment.
ALTER TABLE items ADD COLUMN stock INTEGER CHECK (stock IS NULL OR stock >= 0);

-- "HH:MM" in the shop's time zone (wrangler.jsonc → TIMEZONE). Both empty = open 24 hours.
-- If close_time is earlier than open_time the shop is open overnight (e.g. 18:00 → 02:00).
ALTER TABLE settings ADD COLUMN open_time TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN close_time TEXT NOT NULL DEFAULT '';

-- 0 = the admin switched orders off (holiday, sold out for the day, ...).
ALTER TABLE settings ADD COLUMN accepting_orders INTEGER NOT NULL DEFAULT 1;
