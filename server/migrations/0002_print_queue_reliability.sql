-- 0002_print_queue_reliability.sql — robust print queue + agent heartbeat.
-- Backwards compatible: only adds columns/tables, never drops data.

-- Print queue: add processing/retrying states support, claiming, last_error, updated_at, agent_id.
ALTER TABLE "print_queue"
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "claimed_by" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Index for efficient pending-job claiming per tenant.
CREATE INDEX IF NOT EXISTS "IDX_print_queue_user_status" ON "print_queue" ("user_id", "status");
-- Index for finding stale processing jobs (reclaim after agent death).
CREATE INDEX IF NOT EXISTS "IDX_print_queue_claimed_at" ON "print_queue" ("claimed_at") WHERE "status" = 'processing';

-- Agent heartbeat + online/offline tracking on auto_print_config.
ALTER TABLE "auto_print_config"
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "agent_status" VARCHAR(50) DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS "agent_id" VARCHAR(255);

-- Webhook event dedup (idempotency) for Mercado Pago notifications.
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" SERIAL PRIMARY KEY,
  "provider" VARCHAR(50) NOT NULL DEFAULT 'mercado_pago',
  "event_key" VARCHAR(255) NOT NULL,
  "payload" JSONB,
  "processed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("provider", "event_key")
);

-- Billing events log (audit trail for subscription lifecycle).
CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "mp_preapproval_id" VARCHAR(255),
  "event_type" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50),
  "amount" DECIMAL(10,2),
  "metadata" JSONB,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_billing_events_user" ON "billing_events" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_events_preapproval" ON "billing_events" ("mp_preapproval_id");
