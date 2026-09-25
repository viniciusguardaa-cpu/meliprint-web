-- 0011_security_hardening.sql — session revocation, hashed secrets, MP idempotency.
-- users.sessions_revoked_at: sessions authenticated before this instant are
-- discarded (password reset, account takeover neutralization).
-- auth_tokens.token now stores sha256(token); outstanding plaintext tokens
-- (short-lived reset/verify links) are expired so no plaintext stays usable.
-- checkout_sessions.attempts: each Mercado Pago call gets its own
-- X-Idempotency-Key (session id + attempt), so a network-level resend of the
-- same attempt can't create two preapprovals, while a deliberate retry after
-- a failure isn't answered with the cached error.
-- auto_print_config.agent_token_hash: agent auth looks tokens up by sha256;
-- the token itself is AES-GCM encrypted by the app (legacy plaintext rows
-- are hashed here and encrypted at boot by encryptLegacyAgentTokens).
-- Idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sessions_revoked_at" TIMESTAMP;

ALTER TABLE "checkout_sessions"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "auth_tokens" SET "used_at" = CURRENT_TIMESTAMP WHERE "used_at" IS NULL;

ALTER TABLE "auto_print_config"
  ADD COLUMN IF NOT EXISTS "agent_token_hash" VARCHAR(64);

UPDATE "auto_print_config"
  SET "agent_token_hash" = encode(sha256(convert_to("agent_token", 'UTF8')), 'hex')
  WHERE "agent_token" IS NOT NULL AND "agent_token" NOT LIKE 'enc:v1:%' AND "agent_token_hash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_auto_print_config_agent_token_hash"
  ON "auto_print_config" ("agent_token_hash") WHERE "agent_token_hash" IS NOT NULL;
