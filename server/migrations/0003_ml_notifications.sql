-- 0003_ml_notifications.sql — event-driven Mercado Livre notifications.
-- Dedup table for ML webhook notifications (orders_v2, shipments topics).
-- The poller remains as a reconciliation fallback; notifications drive real-time.

CREATE TABLE IF NOT EXISTS "ml_notifications" (
  "id" SERIAL PRIMARY KEY,
  "topic" VARCHAR(100) NOT NULL,
  "resource" VARCHAR(255) NOT NULL,
  "user_id" BIGINT,
  "payload" JSONB,
  "processed" BOOLEAN DEFAULT false,
  "received_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("topic", "resource")
);
CREATE INDEX IF NOT EXISTS "IDX_ml_notifications_user" ON "ml_notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_ml_notifications_unprocessed" ON "ml_notifications" ("processed") WHERE "processed" = false;
