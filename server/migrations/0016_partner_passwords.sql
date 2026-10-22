-- 0016_partner_passwords.sql — partner portal login with username + password,
-- alongside the existing access key. Additive only: no column is dropped or
-- retyped, and the access-key path keeps working.

ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "username" VARCHAR(60);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255);

-- Usernames are case-insensitive unique; NULL (legacy partners) is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partners_username" ON "partners" (LOWER("username")) WHERE "username" IS NOT NULL;
