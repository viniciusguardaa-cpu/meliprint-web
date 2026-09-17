-- 0005_growth.sql — analytics events, UTM tracking, referrals.

-- Analytics events: first-party funnel tracking.
-- No tokens/secrets logged (enforced in app code, not DB).
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" SERIAL PRIMARY KEY,
  "event_name" VARCHAR(100) NOT NULL,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "visitor_key" VARCHAR(255),               -- anonymous visitor (cookie)
  "session_id" VARCHAR(255),                -- browser session
  "properties" JSONB,                        -- utm_*, plan, device_type, etc.
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_analytics_events_name" ON "analytics_events" ("event_name");
CREATE INDEX IF NOT EXISTS "IDX_analytics_events_user" ON "analytics_events" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_analytics_events_visitor" ON "analytics_events" ("visitor_key");
CREATE INDEX IF NOT EXISTS "IDX_analytics_events_created" ON "analytics_events" ("created_at");

-- UTM attribution: first-touch and last-touch per visitor.
CREATE TABLE IF NOT EXISTS "utm_attribution" (
  "id" SERIAL PRIMARY KEY,
  "visitor_key" VARCHAR(255) NOT NULL,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "utm_source" VARCHAR(255),
  "utm_medium" VARCHAR(255),
  "utm_campaign" VARCHAR(255),
  "utm_content" VARCHAR(255),
  "utm_term" VARCHAR(255),
  "referrer" TEXT,
  "landing_path" VARCHAR(500),
  "touch_type" VARCHAR(20) NOT NULL DEFAULT 'first', -- first | last
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("visitor_key", "touch_type")
);
CREATE INDEX IF NOT EXISTS "IDX_utm_attribution_user" ON "utm_attribution" ("user_id");

-- Referrals: track referral codes and link to signups + subscriptions.
CREATE TABLE IF NOT EXISTS "referrals" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(100) UNIQUE NOT NULL,
  "owner_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "name" VARCHAR(255),                       -- partner/creator name
  "commission_type" VARCHAR(20) DEFAULT 'recurring', -- recurring | fixed
  "commission_value" DECIMAL(10,2) DEFAULT 20.00, -- percentage or fixed BRL
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "referral_signups" (
  "id" SERIAL PRIMARY KEY,
  "referral_id" INTEGER NOT NULL REFERENCES "referrals"("id") ON DELETE CASCADE,
  "referred_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "visitor_key" VARCHAR(255),
  "signed_up_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "subscribed_at" TIMESTAMP,
  UNIQUE("referred_user_id")
);
CREATE INDEX IF NOT EXISTS "IDX_referral_signups_referral" ON "referral_signups" ("referral_id");
