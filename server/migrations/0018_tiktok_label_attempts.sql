-- Only label preparation retries: no bytes have been delivered to the agent.
-- Keep activation generation + store ownership in the key across restarts.
CREATE TABLE IF NOT EXISTS "tiktok_label_attempts" (
  "account_id" INTEGER NOT NULL REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "generation" UUID NOT NULL,
  "shipment_id" TEXT NOT NULL,
  "attempts" SMALLINT NOT NULL CHECK ("attempts" BETWEEN 1 AND 3),
  "next_attempt_at" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("account_id", "user_id", "generation", "shipment_id")
);
