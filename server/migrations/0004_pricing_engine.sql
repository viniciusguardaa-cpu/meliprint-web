-- 0004_pricing_engine.sql — DB-driven plans, prices, trial, pricing experiments.

-- Plans: the product tiers (Start, Pro). Admin can enable/disable.
CREATE TABLE IF NOT EXISTS "plans" (
  "id" VARCHAR(100) PRIMARY KEY,           -- e.g. 'start', 'pro'
  "name" VARCHAR(255) NOT NULL,            -- display name
  "description" TEXT,
  "auto_print" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB,                        -- array of feature strings
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prices: versioned pricing for a plan. New prices don't change existing
-- subscriptions (they keep their contracted price). Supports monthly/annual.
CREATE TABLE IF NOT EXISTS "prices" (
  "id" SERIAL PRIMARY KEY,
  "plan_id" VARCHAR(100) NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "billing_period" VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | annual
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("plan_id", "billing_period")
);
CREATE INDEX IF NOT EXISTS "IDX_prices_plan" ON "prices" ("plan_id");

-- Extend subscriptions to reference plan_id + price_id + contracted price.
-- Keep existing columns for backward compatibility.
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "price_id" INTEGER REFERENCES "prices"("id"),
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "contracted_amount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "contracted_currency" VARCHAR(10) DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(255);

-- Pricing experiments: A/B test price points for new visitors.
-- Never auto-changes prices for existing subscribers.
CREATE TABLE IF NOT EXISTS "pricing_experiments" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "plan_id" VARCHAR(100) NOT NULL REFERENCES "plans"("id"),
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "pricing_variants" (
  "id" SERIAL PRIMARY KEY,
  "experiment_id" INTEGER NOT NULL REFERENCES "pricing_experiments"("id") ON DELETE CASCADE,
  "label" VARCHAR(50) NOT NULL,             -- 'A', 'B', etc.
  "amount" DECIMAL(10,2) NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 50,     -- probability weight (e.g. 50/50)
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("experiment_id", "label")
);

-- Persist which variant a visitor was assigned (for consistent experience).
CREATE TABLE IF NOT EXISTS "pricing_assignments" (
  "id" SERIAL PRIMARY KEY,
  "experiment_id" INTEGER NOT NULL REFERENCES "pricing_experiments"("id") ON DELETE CASCADE,
  "variant_id" INTEGER NOT NULL REFERENCES "pricing_variants"("id") ON DELETE CASCADE,
  "visitor_key" VARCHAR(255) NOT NULL,      -- anonymous visitor identifier (cookie)
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL, -- linked after signup
  "assigned_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("experiment_id", "visitor_key")
);
CREATE INDEX IF NOT EXISTS "IDX_pricing_assignments_visitor" ON "pricing_assignments" ("visitor_key");

-- Coupons: discount codes (prep for future, not launched yet).
CREATE TABLE IF NOT EXISTS "coupons" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(100) UNIQUE NOT NULL,
  "plan_id" VARCHAR(100) REFERENCES "plans"("id"),
  "discount_type" VARCHAR(20) NOT NULL DEFAULT 'percentage', -- percentage | fixed
  "discount_value" DECIMAL(10,2) NOT NULL,
  "max_uses" INTEGER,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial plans and prices.
INSERT INTO "plans" ("id", "name", "description", "auto_print", "is_active", "sort_order", "features")
VALUES
  ('start', 'Printly Start', 'Impressão manual de etiquetas para sellers iniciantes', false, true, 1,
    '["Conectar Mercado Livre","Visualizar envios","Gerar etiquetas","PDF","ZPL","Impressão em lote"]'),
  ('pro', 'Printly Pro', 'Impressão automática e fila inteligente para volume diário', true, true, 2,
    '["Todos os recursos Start","Impressão automática","Printly Agent","Fila automática","Monitoramento de impressão","Histórico","Retries"]')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "auto_print" = EXCLUDED."auto_print",
  "features" = EXCLUDED."features",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "prices" ("plan_id", "billing_period", "amount", "currency", "is_active") VALUES
  ('start', 'monthly', 29.90, 'BRL', true),
  ('pro', 'monthly', 59.90, 'BRL', true)
ON CONFLICT ("plan_id", "billing_period") DO UPDATE SET
  "amount" = EXCLUDED."amount",
  "is_active" = EXCLUDED."is_active";

-- Seed an initial pricing experiment: Pro R$49,90 vs R$59,90 (inactive by default).
INSERT INTO "pricing_experiments" ("id", "name", "plan_id", "is_active")
VALUES (1, 'Pro price test 49.90 vs 59.90', 'pro', false)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pricing_variants" ("experiment_id", "label", "amount", "weight") VALUES
  (1, 'A', 59.90, 50),
  (1, 'B', 49.90, 50)
ON CONFLICT ("experiment_id", "label") DO NOTHING;
