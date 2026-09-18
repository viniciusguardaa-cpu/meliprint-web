import crypto from 'crypto';
import pg from 'pg';
import { encrypt, decrypt, isLegacyPlaintext } from './services/crypto.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's managed Postgres does not have SSL enabled (neither internal nor public proxy),
  // so forcing SSL here causes "server does not support SSL connections" errors.
  ssl: false,
  // Scaled for ~1000 users
  max: 20,                      // Maximum connections in pool
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 5000 // Fail fast if can't connect in 5s
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initDatabase() {
  // Run versioned migrations instead of inline CREATE TABLE IF NOT EXISTS.
  // The migration runner is idempotent and tracks applied versions in
  // schema_migrations. See server/migrations/*.sql.
  const { runMigrations } = await import('./migrate.js');
  await runMigrations();
  console.log('✅ Database initialized (migrations applied)');
}

// User operations
export async function findOrCreateUser(mlUserId: number, nickname: string, email?: string) {
  const result = await pool.query(
    `INSERT INTO "users" ("ml_user_id", "nickname", "email")
     VALUES ($1, $2, $3)
     ON CONFLICT ("ml_user_id") DO UPDATE SET
       "nickname" = EXCLUDED."nickname",
       "updated_at" = CURRENT_TIMESTAMP
     RETURNING *`,
    [mlUserId, nickname, email || null]
  );
  return result.rows[0];
}

export async function getUserByMlId(mlUserId: number) {
  const result = await pool.query(
    `SELECT * FROM "users" WHERE "ml_user_id" = $1`,
    [mlUserId]
  );
  return result.rows[0] || null;
}

export async function getUserById(id: number) {
  const result = await pool.query(
    `SELECT * FROM "users" WHERE "id" = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getUserByEmail(email: string) {
  const result = await pool.query(
    `SELECT * FROM "users" WHERE LOWER("email") = LOWER($1)`,
    [email]
  );
  return result.rows[0] || null;
}

export async function createUser(fields: {
  email: string;
  nickname: string;
  passwordHash?: string | null;
  emailVerified?: boolean;
}) {
  const result = await pool.query(
    `INSERT INTO "users" ("nickname", "email", "password_hash", "email_verified")
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [fields.nickname, fields.email.toLowerCase(), fields.passwordHash ?? null, fields.emailVerified ?? false]
  );
  return result.rows[0];
}

export async function setUserPassword(userId: number, passwordHash: string) {
  await pool.query(
    `UPDATE "users" SET "password_hash" = $2, "email_verified" = true, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    [userId, passwordHash]
  );
}

export async function markEmailVerified(userId: number) {
  await pool.query(
    `UPDATE "users" SET "email_verified" = true, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $1`,
    [userId]
  );
}

/** Keeps the legacy users.ml_user_id convenience column in sync on ML connect. */
export async function setUserMlId(userId: number, mlUserId: string) {
  await pool.query(
    `UPDATE "users" SET "ml_user_id" = $2, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "ml_user_id" IS NULL`,
    [userId, Number(mlUserId)]
  );
}

// ---------------------------------------------------------------------------
// Marketplace accounts: connected provider identities + tokens (encrypted).
// ---------------------------------------------------------------------------

function decryptAccount(row: any) {
  if (!row) return row;
  row.access_token = row.access_token ? decrypt(row.access_token) : null;
  row.refresh_token = row.refresh_token ? decrypt(row.refresh_token) : null;
  return row;
}

// Account statuses: 'active' = usable tokens; 'reauth_required' = refresh
// failed with a definitive auth error and the owner must reconnect.
// reauth_required accounts are still listed everywhere (UI shows a reconnect
// banner) and reconnecting flips them back to 'active' via the upsert.
const LISTABLE_ACCOUNT_STATUSES = `('active', 'reauth_required')`;

export async function getMarketplaceAccountsForUser(userId: number) {
  const result = await pool.query(
    `SELECT * FROM "marketplace_accounts"
     WHERE "user_id" = $1 AND "status" IN ${LISTABLE_ACCOUNT_STATUSES}
     ORDER BY "created_at" ASC`,
    [userId]
  );
  return result.rows.map(decryptAccount);
}

export async function getMarketplaceAccountById(accountId: number) {
  const result = await pool.query(
    `SELECT * FROM "marketplace_accounts" WHERE "id" = $1`,
    [accountId]
  );
  return decryptAccount(result.rows[0] || null);
}

export async function getMarketplaceAccountByExternal(provider: string, externalUserId: string) {
  const result = await pool.query(
    `SELECT * FROM "marketplace_accounts"
     WHERE "provider" = $1 AND "external_user_id" = $2 AND "status" IN ${LISTABLE_ACCOUNT_STATUSES}`,
    [provider, externalUserId]
  );
  return decryptAccount(result.rows[0] || null);
}

export async function getMarketplaceAccountForUser(userId: number, provider: string) {
  const result = await pool.query(
    `SELECT * FROM "marketplace_accounts"
     WHERE "user_id" = $1 AND "provider" = $2 AND "status" IN ${LISTABLE_ACCOUNT_STATUSES}
     ORDER BY "created_at" ASC LIMIT 1`,
    [userId, provider]
  );
  return decryptAccount(result.rows[0] || null);
}

/**
 * Insert or refresh a connected account. On (provider, external_user_id)
 * conflict only tokens/metadata are updated — ownership (user_id) is never
 * reassigned here; callers must check row.user_id in connect flows.
 */
export async function upsertMarketplaceAccount(
  userId: number,
  provider: string,
  externalUserId: string,
  fields: {
    nickname?: string;
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
  }
) {
  const encAccess = fields.accessToken !== undefined ? encrypt(fields.accessToken) : undefined;
  const encRefresh = fields.refreshToken !== undefined ? encrypt(fields.refreshToken) : undefined;
  const result = await pool.query(
    `INSERT INTO "marketplace_accounts"
       ("user_id", "provider", "external_user_id", "nickname", "email",
        "access_token", "refresh_token", "token_expires_at", "updated_at")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT ("provider", "external_user_id") DO UPDATE SET
       "nickname" = COALESCE($4, "marketplace_accounts"."nickname"),
       "email" = COALESCE($5, "marketplace_accounts"."email"),
       "access_token" = COALESCE($6, "marketplace_accounts"."access_token"),
       "refresh_token" = COALESCE($7, "marketplace_accounts"."refresh_token"),
       "token_expires_at" = COALESCE($8, "marketplace_accounts"."token_expires_at"),
       "status" = 'active',
       "updated_at" = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      userId,
      provider,
      externalUserId,
      fields.nickname ?? null,
      fields.email ?? null,
      encAccess ?? null,
      encRefresh ?? null,
      fields.tokenExpiresAt ?? null
    ]
  );
  return decryptAccount(result.rows[0]);
}

export async function updateMarketplaceAccountTokens(
  accountId: number,
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }
) {
  await pool.query(
    `UPDATE "marketplace_accounts" SET
       "access_token" = $2,
       "refresh_token" = COALESCE($3, "refresh_token"),
       "token_expires_at" = COALESCE($4, "token_expires_at"),
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    [
      accountId,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokens.expiresAt ?? null
    ]
  );
}

/** Disconnect an account (owner-scoped). Rows are deleted, not tombstoned. */
export async function deleteMarketplaceAccount(accountId: number, userId: number) {
  const result = await pool.query(
    `DELETE FROM "marketplace_accounts" WHERE "id" = $1 AND "user_id" = $2 RETURNING *`,
    [accountId, userId]
  );
  return result.rows[0] || null;
}

export async function countMarketplaceAccounts(userId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS c FROM "marketplace_accounts" WHERE "user_id" = $1 AND "status" IN ${LISTABLE_ACCOUNT_STATUSES}`,
    [userId]
  );
  return result.rows[0]?.c ?? 0;
}

/**
 * Flag an account as needing reconnection. Called when token refresh fails
 * with a definitive auth error (revoked grant, missing refresh token).
 * Reconnecting flips status back to 'active' via upsertMarketplaceAccount.
 */
export async function markAccountReauthRequired(accountId: number) {
  await pool.query(
    `UPDATE "marketplace_accounts" SET "status" = 'reauth_required', "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "status" = 'active'`,
    [accountId]
  );
}

// ---------------------------------------------------------------------------
// Auth tokens: email verification + password reset (single-use, expiring).
// ---------------------------------------------------------------------------

export async function createAuthToken(userId: number, type: 'verify_email' | 'reset_password', ttlMinutes: number) {
  const token = crypto.randomBytes(32).toString('hex');
  const result = await pool.query(
    `INSERT INTO "auth_tokens" ("user_id", "token", "type", "expires_at")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + ($4 || ' minutes')::INTERVAL)
     RETURNING *`,
    [userId, token, type, String(ttlMinutes)]
  );
  return result.rows[0];
}

/** Consume a token: returns the user_id when valid+unused+unexpired, else null. */
export async function consumeAuthToken(token: string, type: 'verify_email' | 'reset_password') {
  const result = await pool.query(
    `UPDATE "auth_tokens" SET "used_at" = CURRENT_TIMESTAMP
     WHERE "token" = $1 AND "type" = $2 AND "used_at" IS NULL AND "expires_at" > CURRENT_TIMESTAMP
     RETURNING "user_id"`,
    [token, type]
  );
  return result.rows[0]?.user_id ?? null;
}

// Subscription operations
export async function getActiveSubscription(userId: number) {
  const result = await pool.query(
    `SELECT * FROM "subscriptions" 
     WHERE "user_id" = $1 AND "status" IN ('authorized', 'active', 'trialing')
     ORDER BY "created_at" DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Entitled subscription: the subscription that grants product access NOW.
 * Includes authorized/active, in-window trials, and cancelled subscriptions
 * still inside their contracted paid period (current_period_end in the
 * future). This is the correct check for feature access; billing state
 * checks should use getActiveSubscription.
 */
export async function getEntitledSubscription(userId: number) {
  const result = await pool.query(
    `SELECT * FROM "subscriptions"
     WHERE "user_id" = $1 AND (
       "status" IN ('authorized', 'active')
       OR ("status" = 'trialing' AND "trial_ends_at" IS NOT NULL AND "trial_ends_at" > CURRENT_TIMESTAMP)
       OR ("status" = 'cancelled' AND "current_period_end" IS NOT NULL AND "current_period_end" > CURRENT_TIMESTAMP)
     )
     ORDER BY "created_at" DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/** Whether the user may use Pro features (auto-print) right now. */
export async function hasProAccess(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM "subscriptions" s
       JOIN "plans" p ON p."id" = s."plan_id"
       WHERE s."user_id" = $1 AND p."auto_print" = true AND (
         s."status" IN ('authorized', 'active')
         OR (s."status" = 'trialing' AND s."trial_ends_at" IS NOT NULL AND s."trial_ends_at" > CURRENT_TIMESTAMP)
         OR (s."status" = 'cancelled' AND s."current_period_end" IS NOT NULL AND s."current_period_end" > CURRENT_TIMESTAMP)
       )
     ) OR EXISTS(
       SELECT 1 FROM "free_access" f
       JOIN "users" u ON LOWER(u."email") = LOWER(f."email")
       WHERE u."id" = $1
     ) AS "has_access"`,
    [userId]
  );
  return result.rows[0]?.has_access === true;
}

// Trial: one per account, ever — survives cancellation/expiration because it
// is tracked on users.trial_started_at, not on the subscription row.
export async function hasUsedTrial(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT "trial_started_at" FROM "users" WHERE "id" = $1`,
    [userId]
  );
  return !!result.rows[0]?.trial_started_at;
}

export async function markTrialUsed(userId: number) {
  await pool.query(
    `UPDATE "users" SET "trial_started_at" = COALESCE("trial_started_at", CURRENT_TIMESTAMP) WHERE "id" = $1`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Checkout sessions: durable idempotency for checkout creation. A row is
// inserted BEFORE calling Mercado Pago; concurrent requests hit the unique
// (user_id, idempotency_key) constraint and resolve to the same checkout.
// ---------------------------------------------------------------------------

/** Returns 'created' when the row was inserted, or the existing row on conflict. */
export async function startCheckoutSession(
  userId: number,
  idempotencyKey: string,
  planId: string,
  priceId: number | null,
  amount: number,
  currency: string
): Promise<{ created: boolean; session?: any }> {
  try {
    const result = await pool.query(
      `INSERT INTO "checkout_sessions" ("user_id", "idempotency_key", "plan_id", "price_id", "amount", "currency", "status")
       VALUES ($1, $2, $3, $4, $5, $6, 'processing')
       RETURNING *`,
      [userId, idempotencyKey, planId, priceId, amount, currency]
    );
    return { created: true, session: result.rows[0] };
  } catch (err: any) {
    if (err.code === '23505') {
      const existing = await pool.query(
        `SELECT * FROM "checkout_sessions" WHERE "user_id" = $1 AND "idempotency_key" = $2`,
        [userId, idempotencyKey]
      );
      return { created: false, session: existing.rows[0] };
    }
    throw err;
  }
}

export async function completeCheckoutSession(id: number, preapprovalId: string, checkoutUrl: string) {
  await pool.query(
    `UPDATE "checkout_sessions" SET
       "status" = 'completed',
       "preapproval_id" = $2,
       "checkout_url" = $3,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    [id, preapprovalId, checkoutUrl]
  );
}

export async function failCheckoutSession(id: number, error: string) {
  await pool.query(
    `UPDATE "checkout_sessions" SET
       "status" = 'failed',
       "error" = $2,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1`,
    [id, error.slice(0, 500)]
  );
}

/** Re-open a failed session for a retry with the same key. */
export async function retryCheckoutSession(id: number) {
  await pool.query(
    `UPDATE "checkout_sessions" SET
       "status" = 'processing',
       "error" = NULL,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "status" = 'failed'`,
    [id]
  );
}

export async function createSubscription(
  userId: number,
  mpPreapprovalId: string,
  mpPayerId?: string,
  options?: {
    planId?: string;
    priceId?: number;
    contractedAmount?: number;
    contractedCurrency?: string;
    trialEndsAt?: Date;
    idempotencyKey?: string;
  }
) {
  const result = await pool.query(
    `INSERT INTO "subscriptions" (
       "user_id", "mp_preapproval_id", "mp_payer_id", "status",
       "plan_id", "price_id", "contracted_amount", "contracted_currency",
       "trial_ends_at", "idempotency_key", "price"
     )
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      mpPreapprovalId,
      mpPayerId || null,
      options?.planId ?? null,
      options?.priceId ?? null,
      options?.contractedAmount ?? null,
      options?.contractedCurrency ?? 'BRL',
      options?.trialEndsAt ?? null,
      options?.idempotencyKey ?? null,
      // Legacy column (schema default is a stale 29.90) — keep it in sync with
      // the contracted amount for any old readers.
      options?.contractedAmount ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateSubscriptionByPreapprovalId(
  mpPreapprovalId: string,
  status: string,
  periodStart?: Date,
  periodEnd?: Date
) {
  const result = await pool.query(
    `UPDATE "subscriptions" SET
       "status" = $2,
       "current_period_start" = COALESCE($3, "current_period_start"),
       "current_period_end" = COALESCE($4, "current_period_end"),
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "mp_preapproval_id" = $1
     RETURNING *`,
    [mpPreapprovalId, status, periodStart || null, periodEnd || null]
  );
  return result.rows[0] || null;
}

export async function getSubscriptionByPreapprovalId(mpPreapprovalId: string) {
  const result = await pool.query(
    `SELECT s.*, u."ml_user_id", u."nickname" 
     FROM "subscriptions" s
     JOIN "users" u ON s."user_id" = u."id"
     WHERE s."mp_preapproval_id" = $1`,
    [mpPreapprovalId]
  );
  return result.rows[0] || null;
}

// Free access operations (courtesy access granted manually from the admin panel)
export async function isFreeAccessEmail(email: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM "free_access" WHERE LOWER("email") = LOWER($1) LIMIT 1`,
    [email]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getFreeAccessList() {
  const result = await pool.query(
    `SELECT * FROM "free_access" ORDER BY "created_at" DESC`
  );
  return result.rows;
}

export async function addFreeAccess(email: string, note?: string) {
  const result = await pool.query(
    `INSERT INTO "free_access" ("email", "note")
     VALUES ($1, $2)
     ON CONFLICT ("email") DO UPDATE SET "note" = EXCLUDED."note"
     RETURNING *`,
    [email.toLowerCase(), note || null]
  );
  return result.rows[0];
}

export async function removeFreeAccess(id: number) {
  await pool.query(`DELETE FROM "free_access" WHERE "id" = $1`, [id]);
}

// Admin operations
export async function getAllSubscribers() {
  const result = await pool.query(
    `SELECT
       u."id" AS user_id,
       u."ml_user_id",
       u."nickname",
       u."email",
       u."blocked_at",
       u."trial_started_at",
       u."created_at" AS user_created_at,
       s."status",
       s."plan_id",
       s."price",
       s."contracted_amount",
       s."trial_ends_at",
       s."current_period_start",
       s."current_period_end",
       s."mp_preapproval_id",
       s."created_at" AS subscription_created_at,
       c."agent_status",
       c."last_heartbeat_at",
       pe."prints_total",
       pe."last_print_at",
       (fa."id" IS NOT NULL) AS has_free_access
     FROM "users" u
     LEFT JOIN LATERAL (
       SELECT * FROM "subscriptions"
       WHERE "user_id" = u."id"
       ORDER BY "created_at" DESC
       LIMIT 1
     ) s ON true
     LEFT JOIN "auto_print_config" c ON c."user_id" = u."id"
     LEFT JOIN LATERAL (
       SELECT
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = u."id")
         + (SELECT COUNT(*) FROM "print_queue" q WHERE q."user_id" = u."id" AND q."status" = 'printed')
         AS prints_total,
         GREATEST(
           (SELECT MAX(e."created_at") FROM "print_events" e WHERE e."user_id" = u."id"),
           (SELECT MAX(q."printed_at") FROM "print_queue" q WHERE q."user_id" = u."id")
         ) AS last_print_at
     ) pe ON true
     LEFT JOIN "free_access" fa ON u."email" IS NOT NULL AND LOWER(fa."email") = LOWER(u."email")
     ORDER BY u."created_at" DESC`
  );
  return result.rows;
}

export async function getAdminStats() {
  // Paid MRR only: authorized/active subscriptions, excluding free-access
  // courtesy accounts and trials (trialing is not paid revenue).
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "users") AS total_users,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" IN ('authorized', 'active')) AS active_subscriptions,
       (SELECT COALESCE(SUM(s."contracted_amount"), 0)
          FROM "subscriptions" s
          JOIN "users" u ON u."id" = s."user_id"
          WHERE s."status" IN ('authorized', 'active')
            AND NOT EXISTS (
              SELECT 1 FROM "free_access" f WHERE LOWER(f."email") = LOWER(u."email")
            )) AS mrr,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" = 'cancelled') AS cancelled_subscriptions`
  );
  return result.rows[0];
}

/**
 * Full client detail for the admin panel. Never returns secrets: agent and
 * marketplace tokens are intentionally not selected.
 */
export async function getAdminUserDetail(userId: number) {
  const [user, subscriptions, accounts, agent, prints, queue, recentPrints, recentJobs, utm] = await Promise.all([
    pool.query(
      `SELECT "id", "ml_user_id", "nickname", "email", "email_verified",
              "blocked_at", "trial_started_at", "created_at", "updated_at"
       FROM "users" WHERE "id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT s.*, p."name" AS plan_name
       FROM "subscriptions" s
       LEFT JOIN "plans" p ON p."id" = s."plan_id"
       WHERE s."user_id" = $1
       ORDER BY s."created_at" DESC`,
      [userId]
    ),
    pool.query(
      `SELECT "id", "provider", "external_user_id", "nickname", "email",
              "status", "created_at"
       FROM "marketplace_accounts" WHERE "user_id" = $1
       ORDER BY "created_at" ASC`,
      [userId]
    ),
    pool.query(
      `SELECT "enabled", "agent_status", "agent_id", "printer_name",
              "last_heartbeat_at", "last_polled_at"
       FROM "auto_print_config" WHERE "user_id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1) AS events_total,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."source" = 'browser') AS browser_prints,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."source" = 'agent') AS agent_events,
         (SELECT COUNT(*) FROM "print_queue" q WHERE q."user_id" = $1 AND q."status" = 'printed') AS agent_prints,
         (SELECT COUNT(*) FROM "print_events" e WHERE e."user_id" = $1 AND e."created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS prints_30d,
         GREATEST(
           (SELECT MAX(e."created_at") FROM "print_events" e WHERE e."user_id" = $1),
           (SELECT MAX(q."printed_at") FROM "print_queue" q WHERE q."user_id" = $1)
         ) AS last_print_at`,
      [userId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE "status" = 'pending') AS pending,
         COUNT(*) FILTER (WHERE "status" = 'processing') AS processing,
         COUNT(*) FILTER (WHERE "status" = 'printed') AS printed,
         COUNT(*) FILTER (WHERE "status" = 'failed') AS failed,
         COUNT(*) FILTER (WHERE "status" = 'needs_review') AS needs_review
       FROM "print_queue" WHERE "user_id" = $1`,
      [userId]
    ),
    pool.query(
      `SELECT "provider", "shipment_id", "source", "created_at"
       FROM "print_events" WHERE "user_id" = $1
       ORDER BY "created_at" DESC LIMIT 15`,
      [userId]
    ),
    pool.query(
      `SELECT "provider", "shipment_id", "status", "attempts", "last_error",
              "created_at", "printed_at"
       FROM "print_queue" WHERE "user_id" = $1
       ORDER BY "created_at" DESC LIMIT 15`,
      [userId]
    ),
    pool.query(
      `SELECT "utm_source", "utm_medium", "utm_campaign", "referrer", "landing_path"
       FROM "utm_attribution" WHERE "user_id" = $1 AND "touch_type" = 'first'
       LIMIT 1`,
      [userId]
    ),
  ]);

  return {
    user: user.rows[0] || null,
    subscriptions: subscriptions.rows,
    accounts: accounts.rows,
    agent: agent.rows[0] || null,
    prints: prints.rows[0],
    queue: queue.rows[0],
    recentPrints: recentPrints.rows,
    recentJobs: recentJobs.rows,
    utm: utm.rows[0] || null,
  };
}

/** Suspend (blocked=true) or reactivate a user account. */
export async function setUserBlocked(userId: number, blocked: boolean) {
  const result = await pool.query(
    `UPDATE "users" SET
       "blocked_at" = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1
     RETURNING "id", "blocked_at"`,
    [userId, blocked]
  );
  return result.rows[0] || null;
}

/**
 * Admin-granted trial: extends the current trialing subscription if one
 * exists, otherwise creates a new trialing row on the Pro plan.
 * Records on users.trial_started_at so the trial uniqueness invariant holds.
 */
export async function grantUserTrialDays(userId: number, days: number) {
  const extended = await pool.query(
    `UPDATE "subscriptions" SET
       "trial_ends_at" = GREATEST(COALESCE("trial_ends_at", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP) + ($2 || ' days')::INTERVAL,
       "status" = 'trialing',
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = (
       SELECT "id" FROM "subscriptions"
       WHERE "user_id" = $1 AND "status" = 'trialing'
       ORDER BY "created_at" DESC LIMIT 1
     )
     RETURNING *`,
    [userId, String(days)]
  );
  if (extended.rows[0]) {
    await markTrialUsed(userId);
    return { subscription: extended.rows[0], created: false };
  }

  // No trialing subscription: create an admin trial (unique key per grant so
  // repeated grants never collide on mp_preapproval_id / idempotency_key).
  const stamp = Date.now();
  const result = await pool.query(
    `INSERT INTO "subscriptions" (
       "user_id", "mp_preapproval_id", "status", "plan_id",
       "trial_ends_at", "current_period_start", "current_period_end",
       "contracted_currency", "idempotency_key"
     )
     VALUES ($1, $2, 'trialing', 'pro',
             CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL,
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL,
             'BRL', $4)
     RETURNING *`,
    [userId, `trial_admin_${userId}_${stamp}`, String(days), `trial_admin_u${userId}_${stamp}`]
  );
  await markTrialUsed(userId);
  return { subscription: result.rows[0], created: true };
}

/** Daily series for admin charts: signups and prints per day, last N days. */
export async function getAdminTimeseries(days = 30) {
  const safeDays = Math.min(Math.max(Math.floor(days) || 30, 7), 365);
  const result = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')::date,
         CURRENT_DATE, INTERVAL '1 day'
       )::date AS day
     ),
     signups AS (
       SELECT "created_at"::date AS day, COUNT(*) AS n
       FROM "users"
       WHERE "created_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     ),
     browser_prints AS (
       SELECT "created_at"::date AS day, COUNT(*) AS n
       FROM "print_events"
       WHERE "created_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     ),
     agent_prints AS (
       SELECT "printed_at"::date AS day, COUNT(*) AS n
       FROM "print_queue"
       WHERE "printed_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
         AND "status" = 'printed'
       GROUP BY 1
     ),
     cancellations AS (
       SELECT "updated_at"::date AS day, COUNT(*) AS n
       FROM "subscriptions"
       WHERE "status" = 'cancelled'
         AND "updated_at" >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
     )
     SELECT
       d.day,
       COALESCE(s.n, 0) AS signups,
       COALESCE(bp.n, 0) + COALESCE(ap.n, 0) AS prints,
       COALESCE(cx.n, 0) AS cancellations
     FROM days d
     LEFT JOIN signups s ON s.day = d.day
     LEFT JOIN browser_prints bp ON bp.day = d.day
     LEFT JOIN agent_prints ap ON ap.day = d.day
     LEFT JOIN cancellations cx ON cx.day = d.day
     ORDER BY d.day ASC`,
    [safeDays]
  );

  const totals = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "print_events" e
         WHERE e."created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days')
       + (SELECT COUNT(*) FROM "print_queue" q
         WHERE q."printed_at" > CURRENT_TIMESTAMP - INTERVAL '30 days' AND q."status" = 'printed')
       AS prints_30d,
       (SELECT COUNT(*) FROM "users"
         WHERE "created_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS signups_30d,
       (SELECT COUNT(*) FROM "subscriptions"
         WHERE "status" = 'cancelled'
           AND "updated_at" > CURRENT_TIMESTAMP - INTERVAL '30 days') AS cancelled_30d,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" = 'trialing') AS active_trials,
       (SELECT COUNT(*) FROM "users" WHERE "trial_started_at" IS NOT NULL) AS trials_total,
       (SELECT COUNT(*) FROM "subscriptions"
         WHERE "status" IN ('authorized', 'active')) AS paid_subs,
       (SELECT COUNT(*) FROM "subscriptions" s2
         WHERE s2."status" IN ('authorized', 'active')
           AND EXISTS (
             SELECT 1 FROM "subscriptions" t
             WHERE t."user_id" = s2."user_id" AND t."status" IN ('trialing', 'converted')
           )) AS converted_from_trial,
       (SELECT COUNT(*) FROM "users" WHERE "blocked_at" IS NOT NULL) AS blocked_users`
  );

  return {
    days: safeDays,
    series: result.rows.map((r: any) => ({
      day: r.day,
      signups: Number(r.signups),
      prints: Number(r.prints),
      cancellations: Number(r.cancellations),
    })),
    totals: {
      prints30d: Number(totals.rows[0].prints_30d),
      signups30d: Number(totals.rows[0].signups_30d),
      cancelled30d: Number(totals.rows[0].cancelled_30d),
      activeTrials: Number(totals.rows[0].active_trials),
      trialsTotal: Number(totals.rows[0].trials_total),
      paidSubs: Number(totals.rows[0].paid_subs),
      convertedFromTrial: Number(totals.rows[0].converted_from_trial),
      blockedUsers: Number(totals.rows[0].blocked_users),
    },
  };
}

// ---------------------------------------------------------------------------
// Auto-print config operations
// ---------------------------------------------------------------------------

export async function getAutoPrintConfig(userId: number) {
  const result = await pool.query(
    `SELECT * FROM "auto_print_config" WHERE "user_id" = $1`,
    [userId]
  );
  const row = result.rows[0] || null;
  if (row) {
    // Decrypt ML tokens on read. Legacy plaintext rows are decrypted (returned as-is)
    // and re-encrypted on the next write (lazy migration).
    row.ml_access_token = row.ml_access_token ? decrypt(row.ml_access_token) : null;
    row.ml_refresh_token = row.ml_refresh_token ? decrypt(row.ml_refresh_token) : null;
  }
  return row;
}

export async function upsertAutoPrintConfig(
  userId: number,
  fields: {
    enabled?: boolean;
    mlAccessToken?: string;
    mlRefreshToken?: string;
    mlTokenExpiresAt?: number;
    mlSellerId?: number;
    agentToken?: string;
    printerName?: string;
  }
) {
  const encAccess = fields.mlAccessToken !== undefined ? encrypt(fields.mlAccessToken) : undefined;
  const encRefresh = fields.mlRefreshToken !== undefined ? encrypt(fields.mlRefreshToken) : undefined;
  const result = await pool.query(
    `INSERT INTO "auto_print_config" ("user_id", "enabled", "ml_access_token", "ml_refresh_token", "ml_token_expires_at", "ml_seller_id", "agent_token", "printer_name", "updated_at")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT ("user_id") DO UPDATE SET
       "enabled" = COALESCE($2, "auto_print_config"."enabled"),
       "ml_access_token" = COALESCE($3, "auto_print_config"."ml_access_token"),
       "ml_refresh_token" = COALESCE($4, "auto_print_config"."ml_refresh_token"),
       "ml_token_expires_at" = COALESCE($5, "auto_print_config"."ml_token_expires_at"),
       "ml_seller_id" = COALESCE($6, "auto_print_config"."ml_seller_id"),
       "agent_token" = COALESCE($7, "auto_print_config"."agent_token"),
       "printer_name" = COALESCE($8, "auto_print_config"."printer_name"),
       "updated_at" = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      userId,
      fields.enabled ?? null,
      encAccess ?? null,
      encRefresh ?? null,
      fields.mlTokenExpiresAt ?? null,
      fields.mlSellerId ?? null,
      fields.agentToken ?? null,
      fields.printerName ?? null
    ]
  );
  const row = result.rows[0];
  if (row) {
    row.ml_access_token = row.ml_access_token ? decrypt(row.ml_access_token) : null;
    row.ml_refresh_token = row.ml_refresh_token ? decrypt(row.ml_refresh_token) : null;
  }
  return row;
}

export async function updateAutoPrintTokens(
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
) {
  await pool.query(
    `UPDATE "auto_print_config" SET
       "ml_access_token" = $2,
       "ml_refresh_token" = $3,
       "ml_token_expires_at" = $4,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "user_id" = $1`,
    [userId, encrypt(accessToken), encrypt(refreshToken), expiresAt]
  );
}

export async function updateAutoPrintLastPolled(userId: number) {
  await pool.query(
    `UPDATE "auto_print_config" SET "last_polled_at" = CURRENT_TIMESTAMP WHERE "user_id" = $1`,
    [userId]
  );
}

export async function getAutoPrintEnabledConfigs() {
  // Only configs whose owner currently has Pro access: authorized/active
  // subscription on an auto_print plan, in-window trial, cancelled-but-still-
  // in-period, or a free-access courtesy account.
  const result = await pool.query(
    `SELECT c.* FROM "auto_print_config" c
     JOIN "users" u ON u."id" = c."user_id"
     WHERE c."enabled" = true AND u."blocked_at" IS NULL AND (
       EXISTS (
         SELECT 1 FROM "subscriptions" s
         JOIN "plans" p ON p."id" = s."plan_id"
         WHERE s."user_id" = c."user_id" AND p."auto_print" = true AND (
           s."status" IN ('authorized', 'active')
           OR (s."status" = 'trialing' AND s."trial_ends_at" IS NOT NULL AND s."trial_ends_at" > CURRENT_TIMESTAMP)
           OR (s."status" = 'cancelled' AND s."current_period_end" IS NOT NULL AND s."current_period_end" > CURRENT_TIMESTAMP)
         )
       )
       OR EXISTS (
         SELECT 1 FROM "free_access" f WHERE LOWER(f."email") = LOWER(u."email") AND u."email" IS NOT NULL
       )
     )`
  );
  for (const row of result.rows) {
    row.ml_access_token = row.ml_access_token ? decrypt(row.ml_access_token) : null;
    row.ml_refresh_token = row.ml_refresh_token ? decrypt(row.ml_refresh_token) : null;
  }
  return result.rows;
}

export async function getAutoPrintConfigByAgentToken(token: string) {
  const result = await pool.query(
    `SELECT c.*, u."ml_user_id" FROM "auto_print_config" c
     JOIN "users" u ON c."user_id" = u."id"
     WHERE c."agent_token" = $1 AND c."enabled" = true AND u."blocked_at" IS NULL`,
    [token]
  );
  const row = result.rows[0] || null;
  if (row) {
    row.ml_access_token = row.ml_access_token ? decrypt(row.ml_access_token) : null;
    row.ml_refresh_token = row.ml_refresh_token ? decrypt(row.ml_refresh_token) : null;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Print queue operations
// ---------------------------------------------------------------------------

export async function addPrintQueueJob(userId: number, shipmentId: number | string, zpl: string, provider = 'mercadolivre') {
  // INSERT ... ON CONFLICT DO NOTHING so we never duplicate a shipment already queued
  const result = await pool.query(
    `INSERT INTO "print_queue" ("user_id", "provider", "shipment_id", "zpl", "status")
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT ("user_id", "provider", "shipment_id") DO NOTHING
     RETURNING *`,
    [userId, provider, String(shipmentId), zpl]
  );
  return result.rows[0] || null;
}

export async function getPendingPrintJobs(userId: number, limit = 20) {
  const result = await pool.query(
    `SELECT * FROM "print_queue"
     WHERE "user_id" = $1 AND "status" = 'pending'
     ORDER BY "created_at" ASC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * Atomically claim pending jobs for an agent so two agents can't double-print.
 * Moves jobs to 'processing' with claimed_at/claimed_by. Returns the claimed jobs.
 */
export async function claimPrintJobs(userId: number, agentId: string, limit = 5) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = 'processing',
       "claimed_at" = CURRENT_TIMESTAMP,
       "claimed_by" = $3,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" IN (
       SELECT "id" FROM "print_queue"
       WHERE "user_id" = $1 AND "status" = 'pending' AND "content_type" = 'zpl'
       ORDER BY "created_at" ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [userId, limit, agentId]
  );
  return result.rows;
}

/**
 * Jobs stuck in 'processing' for too long (agent died mid-print or lost
 * network after printing). The outcome is UNCERTAIN — the label may already
 * be in the spooler — so we move them to 'needs_review' for a human decision
 * instead of auto-reprinting.
 */
export async function releaseStaleJobs(staleMs = 5 * 60 * 1000) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = 'needs_review',
       "last_error" = COALESCE("last_error", 'agent_lost_contact_uncertain'),
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "status" = 'processing'
       AND "claimed_at" IS NOT NULL
       AND "claimed_at" < CURRENT_TIMESTAMP - ($1 || ' milliseconds')::INTERVAL
     RETURNING id, user_id`,
    [String(staleMs)]
  );
  return result.rows;
}

export async function getJobsNeedingReview(userId: number) {
  const result = await pool.query(
    `SELECT "id", "shipment_id", "created_at", "claimed_at", "claimed_by", "last_error", "sent_to_printer_at"
     FROM "print_queue"
     WHERE "user_id" = $1 AND "status" = 'needs_review'
     ORDER BY "created_at" ASC`,
    [userId]
  );
  return result.rows;
}

/**
 * Resolve a needs_review job (owner-scoped):
 *  - 'requeue': the label was never printed → back to pending.
 *  - 'confirm_printed': the user verified the label came out → printed.
 */
export async function resolveJobReview(userId: number, jobId: number, action: 'requeue' | 'confirm_printed') {
  const sql = action === 'requeue'
    ? `UPDATE "print_queue" SET
         "status" = 'pending',
         "claimed_at" = NULL, "claimed_by" = NULL,
         "error" = NULL,
         "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "user_id" = $2 AND "status" = 'needs_review'
       RETURNING *`
    : `UPDATE "print_queue" SET
         "status" = 'printed',
         "printed_at" = COALESCE("sent_to_printer_at", CURRENT_TIMESTAMP),
         "confirmed_at" = COALESCE("confirmed_at", CURRENT_TIMESTAMP),
         "updated_at" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "user_id" = $2 AND "status" = 'needs_review'
       RETURNING *`;
  const result = await pool.query(sql, [jobId, userId]);
  return result.rows[0] || null;
}

/** Manual retry of a failed job (owner-scoped). Resets to pending. */
export async function retryFailedJob(userId: number, jobId: number) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = 'pending',
       "error" = NULL,
       "claimed_at" = NULL,
       "claimed_by" = NULL,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "user_id" = $2 AND "status" = 'failed'
     RETURNING *`,
    [jobId, userId]
  );
  return result.rows[0] || null;
}

/** Regenerate a job's ZPL (owner-scoped). Used when ML label content changed. */
export async function regenerateJob(userId: number, jobId: number, zpl: string) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "zpl" = $3,
       "status" = 'pending',
       "error" = NULL,
       "attempts" = 0,
       "claimed_at" = NULL,
       "claimed_by" = NULL,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "user_id" = $2
     RETURNING *`,
    [jobId, userId, zpl]
  );
  return result.rows[0] || null;
}

export async function markPrintJobPrinted(userId: number, jobId: number, sentToPrinterAt?: Date) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = 'printed',
       "sent_to_printer_at" = COALESCE($3, "sent_to_printer_at", CURRENT_TIMESTAMP),
       "printed_at" = COALESCE($3, "sent_to_printer_at", CURRENT_TIMESTAMP),
       "confirmed_at" = CURRENT_TIMESTAMP,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "user_id" = $2`,
    [jobId, userId, sentToPrinterAt || null]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markPrintJobFailed(userId: number, jobId: number, error: string) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = CASE WHEN "attempts" + 1 >= 3 THEN 'failed' ELSE 'pending' END,
       "attempts" = "attempts" + 1,
       "error" = $3,
       "last_error" = $3,
       "claimed_at" = NULL,
       "claimed_by" = NULL,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "user_id" = $2`,
    [jobId, userId, error]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getPrintQueueStats(userId: number) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'pending') AS pending,
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'processing') AS processing,
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'printed') AS printed,
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'failed') AS failed`,
    [userId]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Browser print history (Pro: print_history)
// ---------------------------------------------------------------------------

/** Record that a user printed labels via the browser (batch of shipment ids). */
export async function recordPrintEvents(
  userId: number,
  shipmentIds: Array<number | string>,
  source: 'browser' | 'agent' = 'browser',
  provider = 'mercadolivre'
) {
  if (shipmentIds.length === 0) return;
  const values = shipmentIds.map((_, i) => `($1, $${i + 2}, $${shipmentIds.length + 2}, $${shipmentIds.length + 3})`).join(', ');
  await pool.query(
    `INSERT INTO "print_events" ("user_id", "shipment_id", "source", "provider") VALUES ${values}`,
    [userId, ...shipmentIds.map(String), source, provider]
  );
}

/** Recent print history for the Pro history tab. */
export async function getPrintEvents(userId: number, limit = 50) {
  const result = await pool.query(
    `SELECT "id", "provider", "shipment_id", "source", "created_at"
     FROM "print_events"
     WHERE "user_id" = $1
     ORDER BY "created_at" DESC
     LIMIT $2`,
    [userId, Math.min(limit, 200)]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Agent heartbeat
// ---------------------------------------------------------------------------

export async function updateAgentHeartbeat(agentId: string, userId: number) {
  await pool.query(
    `UPDATE "auto_print_config" SET
       "last_heartbeat_at" = CURRENT_TIMESTAMP,
       "agent_status" = 'online',
       "agent_id" = $3,
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "user_id" = $1`,
    [userId, agentId, agentId]
  );
}

/** Mark agents whose last heartbeat is older than the threshold as offline. */
export async function markStaleAgentsOffline(thresholdMs = 60 * 1000) {
  await pool.query(
    `UPDATE "auto_print_config" SET "agent_status" = 'offline'
     WHERE "agent_status" = 'online'
       AND "last_heartbeat_at" IS NOT NULL
       AND "last_heartbeat_at" < CURRENT_TIMESTAMP - ($1 || ' milliseconds')::INTERVAL`,
    [String(thresholdMs)]
  );
}

export async function getAgentStatusCounts() {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "auto_print_config" WHERE "agent_status" = 'online') AS online,
       (SELECT COUNT(*) FROM "auto_print_config" WHERE "agent_status" = 'offline' AND "enabled" = true) AS offline`
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Webhook event dedup (idempotency)
// ---------------------------------------------------------------------------

/**
 * Try to record a webhook event for processing.
 * Returns:
 *  - 'new': first time we see this event key → process it.
 *  - 'retry': we saw it before but processing failed → process again.
 *  - 'duplicate': already processed (or currently processing) → skip.
 */
export async function recordWebhookEvent(provider: string, eventKey: string, payload?: any): Promise<'new' | 'retry' | 'duplicate'> {
  try {
    await pool.query(
      `INSERT INTO "webhook_events" ("provider", "event_key", "payload", "status")
       VALUES ($1, $2, $3, 'received')`,
      [provider, eventKey, payload ? JSON.stringify(payload) : null]
    );
    return 'new';
  } catch (err: any) {
    if (err.code !== '23505') throw err;
    // Existing row: retry if the previous processing failed (or looks stuck
    // in 'received' for >10min — process crashed mid-handling).
    const existing = await pool.query(
      `UPDATE "webhook_events" SET "attempts" = "attempts" + 1
       WHERE "provider" = $1 AND "event_key" = $2
         AND ("status" = 'failed'
              OR ("status" = 'received' AND "processed_at" < CURRENT_TIMESTAMP - INTERVAL '10 minutes'))
       RETURNING "status"`,
      [provider, eventKey]
    );
    return (existing.rowCount ?? 0) > 0 ? 'retry' : 'duplicate';
  }
}

export async function markWebhookEventProcessed(provider: string, eventKey: string) {
  await pool.query(
    `UPDATE "webhook_events" SET "status" = 'processed', "processed_at" = CURRENT_TIMESTAMP, "last_error" = NULL
     WHERE "provider" = $1 AND "event_key" = $2`,
    [provider, eventKey]
  );
}

export async function markWebhookEventFailed(provider: string, eventKey: string, error: string) {
  await pool.query(
    `UPDATE "webhook_events" SET "status" = 'failed', "last_error" = $3
     WHERE "provider" = $1 AND "event_key" = $2`,
    [provider, eventKey, error.slice(0, 500)]
  );
}

export async function recordBillingEvent(
  userId: number | null,
  mpPreapprovalId: string | null,
  eventType: string,
  status?: string,
  amount?: number,
  metadata?: any
) {
  await pool.query(
    `INSERT INTO "billing_events" ("user_id", "mp_preapproval_id", "event_type", "status", "amount", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, mpPreapprovalId, eventType, status ?? null, amount ?? null, metadata ? JSON.stringify(metadata) : null]
  );
}

// ---------------------------------------------------------------------------
// Mercado Livre notifications (event-driven auto-print)
// ---------------------------------------------------------------------------

/**
 * Record an ML notification if new. Dedup is per DELIVERY (delivery_key =
 * the notification's unique _id, or a stable hash fallback) so successive
 * changes to the same shipment are all processed.
 * Returns the row id when new, or null when it's a duplicate delivery.
 */
export async function recordMLNotificationIfNew(
  topic: string,
  resource: string,
  deliveryKey: string,
  userId?: number,
  payload?: any
): Promise<number | null> {
  try {
    const result = await pool.query(
      `INSERT INTO "ml_notifications" ("topic", "resource", "delivery_key", "user_id", "payload")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "id"`,
      [topic, resource, deliveryKey, userId ?? null, payload ? JSON.stringify(payload) : null]
    );
    return result.rows[0].id;
  } catch (err: any) {
    if (err.code === '23505') return null; // same delivery retried by ML
    throw err;
  }
}

export async function markMLNotificationProcessed(id: number) {
  await pool.query(
    `UPDATE "ml_notifications" SET "processed" = true, "processed_at" = CURRENT_TIMESTAMP, "last_error" = NULL WHERE "id" = $1`,
    [id]
  );
}

export async function markMLNotificationFailed(id: number, error: string) {
  await pool.query(
    `UPDATE "ml_notifications" SET "attempts" = "attempts" + 1, "last_error" = $2 WHERE "id" = $1`,
    [id, error.slice(0, 500)]
  );
}

/**
 * Unprocessed notifications older than `olderThanMs`, for the retry sweeper.
 * Rows that keep failing eventually exceed maxAttempts and stay for audit.
 */
export async function getUnprocessedMLNotifications(olderThanMs = 60_000, maxAttempts = 10, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM "ml_notifications"
     WHERE "processed" = false
       AND "attempts" < $1
       AND "received_at" < CURRENT_TIMESTAMP - ($2 || ' milliseconds')::INTERVAL
     ORDER BY "received_at" ASC
     LIMIT $3`,
    [maxAttempts, String(olderThanMs), limit]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Agent pairing codes
// ---------------------------------------------------------------------------

export async function createPairingCode(userId: number, code: string, ttlMinutes = 10) {
  const result = await pool.query(
    `INSERT INTO "agent_pairing_codes" ("code", "user_id", "expires_at")
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 || ' minutes')::INTERVAL)
     RETURNING *`,
    [code, userId, String(ttlMinutes)]
  );
  return result.rows[0];
}

/** Consume a pairing code atomically: returns the row if valid+unused. */
export async function consumePairingCode(code: string) {
  const result = await pool.query(
    `UPDATE "agent_pairing_codes" SET "used_at" = CURRENT_TIMESTAMP
     WHERE "code" = $1 AND "used_at" IS NULL AND "expires_at" > CURRENT_TIMESTAMP
     RETURNING *`,
    [code]
  );
  return result.rows[0] || null;
}

export default pool;
