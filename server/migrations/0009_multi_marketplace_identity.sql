-- 0009_multi_marketplace_identity.sql
-- Identity model B: "users" becomes the internal LabelGo identity (email +
-- optional password). Marketplaces become connected accounts holding their
-- own OAuth tokens, so a user can exist without any ML account and can hold
-- several marketplace accounts at once.

-- users: own identity, ML id no longer required.
ALTER TABLE "users" ALTER COLUMN "ml_user_id" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique"
  ON "users" (LOWER("email")) WHERE "email" IS NOT NULL;

-- Connected marketplace accounts: one LabelGo user → N marketplace accounts.
-- Tokens are stored encrypted (AES-256-GCM, same scheme as auto_print_config).
CREATE TABLE IF NOT EXISTS "marketplace_accounts" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" VARCHAR(50) NOT NULL,              -- mercadolivre | shopee | ...
  "external_user_id" VARCHAR(255) NOT NULL,     -- ML user id, Shopee shop_id, ...
  "nickname" VARCHAR(255),
  "email" VARCHAR(255),
  "access_token" TEXT,
  "refresh_token" TEXT,
  "token_expires_at" BIGINT,                    -- epoch ms
  "status" VARCHAR(50) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("provider", "external_user_id")
);
CREATE INDEX IF NOT EXISTS "IDX_marketplace_accounts_user" ON "marketplace_accounts" ("user_id");

-- Backfill: every existing user gets a mercadolivre account for their ML id.
INSERT INTO "marketplace_accounts" ("user_id", "provider", "external_user_id", "nickname", "email")
SELECT "id", 'mercadolivre', "ml_user_id"::text, "nickname", "email"
FROM "users"
WHERE "ml_user_id" IS NOT NULL
ON CONFLICT ("provider", "external_user_id") DO NOTHING;

-- Tokens already persisted (encrypted) for auto-print users move to the
-- account row. The ml_* columns stay on auto_print_config for now but are
-- no longer read.
UPDATE "marketplace_accounts" ma
SET "access_token" = c."ml_access_token",
    "refresh_token" = c."ml_refresh_token",
    "token_expires_at" = c."ml_token_expires_at"
FROM "auto_print_config" c
WHERE ma."user_id" = c."user_id"
  AND ma."provider" = 'mercadolivre'
  AND c."ml_access_token" IS NOT NULL;

-- Email verification + password reset tokens (email/password auth).
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" VARCHAR(255) NOT NULL UNIQUE,
  "type" VARCHAR(30) NOT NULL,                  -- verify_email | reset_password
  "expires_at" TIMESTAMP NOT NULL,
  "used_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_auth_tokens_user" ON "auth_tokens" ("user_id");

-- print_queue: provider-agnostic. External shipment ids become TEXT
-- (Shopee order_sn etc. are not numeric) and the dedup key gains provider.
ALTER TABLE "print_queue" ADD COLUMN IF NOT EXISTS "provider" VARCHAR(50) NOT NULL DEFAULT 'mercadolivre';
ALTER TABLE "print_queue" ADD COLUMN IF NOT EXISTS "content_type" VARCHAR(20) NOT NULL DEFAULT 'zpl';
ALTER TABLE "print_queue" ALTER COLUMN "shipment_id" TYPE TEXT USING "shipment_id"::text;
ALTER TABLE "print_queue" DROP CONSTRAINT IF EXISTS "print_queue_user_id_shipment_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_print_queue_user_provider_shipment"
  ON "print_queue" ("user_id", "provider", "shipment_id");

-- print_events: same treatment (shipment ids are external, provider-scoped).
ALTER TABLE "print_events" ADD COLUMN IF NOT EXISTS "provider" VARCHAR(50) NOT NULL DEFAULT 'mercadolivre';
ALTER TABLE "print_events" ALTER COLUMN "shipment_id" TYPE TEXT USING "shipment_id"::text;
