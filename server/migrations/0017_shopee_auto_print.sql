-- Server-side PDF compatibility; old agents keep the same claim/ack protocol.
ALTER TABLE "auto_print_config"
  ADD COLUMN IF NOT EXISTS "shopee_generation" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "label_dpi" SMALLINT NOT NULL DEFAULT 203 CHECK ("label_dpi" IN (203, 300));
ALTER TABLE "print_queue"
  ADD COLUMN IF NOT EXISTS "account_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "auto_print_generation" UUID,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Never release the old, unscoped PDF backlog when enabling legacy compatibility.
UPDATE "print_queue" SET "status" = 'needs_review',
  "last_error" = 'shopee_legacy_backlog_manual_review'
WHERE "provider" = 'shopee' AND "account_id" IS NULL AND "status" = 'pending';

DROP INDEX IF EXISTS "IDX_print_queue_user_provider_shipment";
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_print_queue_unscoped_shipment"
  ON "print_queue" ("user_id", "provider", "shipment_id") WHERE "account_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_print_queue_account_shipment"
  ON "print_queue" ("user_id", "provider", "account_id", "shipment_id") WHERE "account_id" IS NOT NULL;

-- The first COMPLETE discovery after activation is an exclusion snapshot, not a
-- print request. Persist even orders whose documents/NF are not ready yet.
CREATE TABLE IF NOT EXISTS "shopee_auto_print_state" (
  "account_id" INTEGER PRIMARY KEY REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "generation" UUID NOT NULL,
  "excluded_ids" TEXT[] NOT NULL,
  "initialized_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
