-- 0015_partners.sql — partner/affiliate program: referral link attribution and
-- a restricted partner view. Additive only; no existing table is changed.
-- Commission terms are per partner. Rate defaults to 20% of gross revenue (owner
-- decision 2026-10-22); duration is NULL (undecided) until the owner sets it.

CREATE TABLE IF NOT EXISTS "partners" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "contact_email" VARCHAR(255),
  "ref_code" VARCHAR(40) NOT NULL UNIQUE,          -- used in https://labelgo.com.br/?ref=<code>
  "commission_pct" DECIMAL(5,2) DEFAULT 20.00,     -- % of gross revenue; 20 is the owner-chosen default, editable per partner
  "commission_months" INTEGER,                     -- NULL = not defined yet
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "access_key_hash" VARCHAR(64) NOT NULL UNIQUE,   -- sha256 of the partner's access key (key is shown once)
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK ("commission_pct" IS NULL OR ("commission_pct" >= 0 AND "commission_pct" <= 100)),
  CHECK ("commission_months" IS NULL OR "commission_months" > 0)
);

-- A visit that arrived through a partner link (anonymous visitor key only).
CREATE TABLE IF NOT EXISTS "partner_clicks" (
  "id" SERIAL PRIMARY KEY,
  "partner_id" INTEGER NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "visitor_key" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_partner_clicks_visitor" ON "partner_clicks" ("visitor_key", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_partner_clicks_partner" ON "partner_clicks" ("partner_id");

-- An account attributed to a partner at signup (one partner per account).
CREATE TABLE IF NOT EXISTS "partner_referrals" (
  "id" SERIAL PRIMARY KEY,
  "partner_id" INTEGER NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "signed_up_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "first_paid_at" TIMESTAMP,
  UNIQUE ("user_id")
);
CREATE INDEX IF NOT EXISTS "IDX_partner_referrals_partner" ON "partner_referrals" ("partner_id");
