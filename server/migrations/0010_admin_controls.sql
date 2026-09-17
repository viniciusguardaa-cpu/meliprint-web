-- 0010_admin_controls.sql — admin controls: account suspension.
-- users.blocked_at set => account suspended: API access denied (403
-- account_blocked), agent stops receiving jobs, no new jobs enqueued.
-- Idempotent: only adds a column.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "blocked_at" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "IDX_users_blocked" ON "users" ("blocked_at")
  WHERE "blocked_at" IS NOT NULL;
