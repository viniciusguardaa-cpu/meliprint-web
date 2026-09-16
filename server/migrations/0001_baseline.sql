-- 0001_baseline.sql — reproduces the existing schema created by the old
-- initDatabase() function. Idempotent (IF NOT EXISTS) so it is a no-op on
-- databases that already have these tables. Recorded as the baseline so
-- all subsequent migrations are tracked in schema_migrations.

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "ml_user_id" BIGINT UNIQUE NOT NULL,
  "nickname" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE CASCADE,
  "mp_preapproval_id" VARCHAR(255) UNIQUE,
  "mp_payer_id" VARCHAR(255),
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "plan_id" VARCHAR(100) DEFAULT 'monthly_29_90',
  "price" DECIMAL(10,2) DEFAULT 29.90,
  "current_period_start" TIMESTAMP,
  "current_period_end" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_subscriptions_user_id" ON "subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_subscriptions_status" ON "subscriptions" ("status");
CREATE INDEX IF NOT EXISTS "IDX_users_ml_user_id" ON "users" ("ml_user_id");

CREATE TABLE IF NOT EXISTS "free_access" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "note" VARCHAR(255),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "auto_print_config" (
  "user_id" INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "ml_access_token" TEXT,
  "ml_refresh_token" TEXT,
  "ml_token_expires_at" BIGINT,
  "ml_seller_id" BIGINT,
  "agent_token" VARCHAR(255) UNIQUE,
  "printer_name" VARCHAR(255),
  "last_polled_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "print_queue" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "shipment_id" BIGINT NOT NULL,
  "zpl" TEXT,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "printed_at" TIMESTAMP,
  UNIQUE("user_id", "shipment_id")
);
CREATE INDEX IF NOT EXISTS "IDX_print_queue_status" ON "print_queue" ("status");
