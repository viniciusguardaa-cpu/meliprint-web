-- 0006_launch_readiness.sql — launch fixes: checkout idempotency, webhook retry,
-- ML notification per-delivery dedup, reconciliation cursor, print confirmation
-- split, agent pairing, single-trial-per-account, needs_review jobs.
-- Backwards compatible: only adds columns/tables/indexes, never drops data.

-- ---------------------------------------------------------------------------
-- Checkout idempotency: a durable record of every checkout attempt keyed by
-- (user_id, idempotency_key). Inserted BEFORE calling Mercado Pago so
-- concurrent/duplicate requests resolve to the same checkout URL, and failed
-- attempts can be safely retried.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "checkout_sessions" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "plan_id" VARCHAR(100),
  "price_id" INTEGER,
  "amount" DECIMAL(10,2),
  "currency" VARCHAR(10) DEFAULT 'BRL',
  "status" VARCHAR(30) NOT NULL DEFAULT 'processing', -- processing | completed | failed
  "preapproval_id" VARCHAR(255),
  "checkout_url" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "IDX_checkout_sessions_user" ON "checkout_sessions" ("user_id");

-- Unique idempotency key on subscriptions (only non-null keys).
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscriptions_idempotency_key"
  ON "subscriptions" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Reconciliation cursor: rotate through all subscriptions instead of re-reading
-- the same 50 rows ordered by updated_at (which only moves on status change).
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "last_reconciled_at" TIMESTAMP;

-- Trial uniqueness survives subscription deletion/cancellation.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_started_at" TIMESTAMP;

-- ---------------------------------------------------------------------------
-- Webhook events: track processing state so a failed event can be retried
-- instead of being permanently swallowed by the dedup unique constraint.
-- ---------------------------------------------------------------------------
ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'processed', -- received | processed | failed
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT;

-- ---------------------------------------------------------------------------
-- ML notifications: dedup per DELIVERY (each notification has a unique _id),
-- not per (topic, resource) — successive changes to the same shipment must be
-- processed. Keep every delivery for audit + persisted retry.
-- ---------------------------------------------------------------------------
ALTER TABLE "ml_notifications" DROP CONSTRAINT IF EXISTS "ml_notifications_topic_resource_key";
ALTER TABLE "ml_notifications"
  ADD COLUMN IF NOT EXISTS "delivery_key" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ml_notifications_delivery_key"
  ON "ml_notifications" ("delivery_key") WHERE "delivery_key" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Print queue: split "accepted by the print spooler" from "confirmed to the
-- server". Uncertain outcomes become 'needs_review' instead of auto-reprint.
-- ---------------------------------------------------------------------------
ALTER TABLE "print_queue"
  ADD COLUMN IF NOT EXISTS "sent_to_printer_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "confirmation_attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "IDX_print_queue_needs_review"
  ON "print_queue" ("user_id", "status") WHERE "status" = 'needs_review';

-- ---------------------------------------------------------------------------
-- Agent pairing: short-lived codes shown in the web panel, exchanged by the
-- agent for an agent_token (no .env editing on the customer machine).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_pairing_codes" (
  "code" VARCHAR(20) PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP NOT NULL,
  "used_at" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_agent_pairing_codes_user" ON "agent_pairing_codes" ("user_id");
