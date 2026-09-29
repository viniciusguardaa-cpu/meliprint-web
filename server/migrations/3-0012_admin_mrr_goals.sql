-- One set of revenue goals shared by the admin dashboard. Amounts are whole BRL
-- cents, so an edit cannot accumulate floating-point rounding errors.
CREATE TABLE IF NOT EXISTS "admin_mrr_goals" (
  "id" SMALLINT PRIMARY KEY CHECK ("id" = 1),
  "achievable_cents" BIGINT NOT NULL CHECK ("achievable_cents" > 0),
  "ideal_cents" BIGINT NOT NULL CHECK ("ideal_cents" > "achievable_cents"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "admin_mrr_goals" ("id", "achievable_cents", "ideal_cents")
VALUES (1, 1000000, 3000000)
ON CONFLICT ("id") DO NOTHING;
