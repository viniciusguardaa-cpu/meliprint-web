-- 0014_shopee_auto_arrange.sql
-- Opt-in automatic "organizar envio" (ship_order) for Shopee accounts.
-- Everything defaults to OFF: no existing account changes behavior.

ALTER TABLE "marketplace_accounts"
  ADD COLUMN IF NOT EXISTS "auto_arrange_shipment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "marketplace_accounts"
  ADD COLUMN IF NOT EXISTS "arrange_method" VARCHAR(20) NOT NULL DEFAULT 'pickup';

-- One row per (account, order, package) the first time we try to arrange it.
-- The row is inserted BEFORE calling Shopee, so a package is never sent twice:
--   claimed   = request in flight / outcome uncertain -> never retried automatically
--   requested = Shopee accepted ship_order
--   failed    = Shopee answered with an error (nothing was arranged); retried up to 3 times
CREATE TABLE IF NOT EXISTS "shipment_arrange_log" (
  "id" SERIAL PRIMARY KEY,
  "account_id" INTEGER NOT NULL REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE,
  "order_sn" VARCHAR(100) NOT NULL,
  "package_number" VARCHAR(100) NOT NULL DEFAULT '',
  "method" VARCHAR(20),
  "status" VARCHAR(20) NOT NULL DEFAULT 'claimed',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("account_id", "order_sn", "package_number")
);
