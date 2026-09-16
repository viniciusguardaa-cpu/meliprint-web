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

// Subscription operations
export async function getActiveSubscription(userId: number) {
  const result = await pool.query(
    `SELECT * FROM "subscriptions" 
     WHERE "user_id" = $1 AND "status" IN ('authorized', 'active')
     ORDER BY "created_at" DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function createSubscription(userId: number, mpPreapprovalId: string, mpPayerId?: string) {
  const result = await pool.query(
    `INSERT INTO "subscriptions" ("user_id", "mp_preapproval_id", "mp_payer_id", "status")
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [userId, mpPreapprovalId, mpPayerId || null]
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
       u."created_at" AS user_created_at,
       s."status",
       s."plan_id",
       s."price",
       s."current_period_start",
       s."current_period_end",
       s."mp_preapproval_id",
       s."created_at" AS subscription_created_at
     FROM "users" u
     LEFT JOIN LATERAL (
       SELECT * FROM "subscriptions"
       WHERE "user_id" = u."id"
       ORDER BY "created_at" DESC
       LIMIT 1
     ) s ON true
     ORDER BY u."created_at" DESC`
  );
  return result.rows;
}

export async function getAdminStats() {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM "users") AS total_users,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" IN ('authorized', 'active')) AS active_subscriptions,
       (SELECT COALESCE(SUM("price"), 0) FROM "subscriptions" WHERE "status" IN ('authorized', 'active')) AS mrr,
       (SELECT COUNT(*) FROM "subscriptions" WHERE "status" = 'cancelled') AS cancelled_subscriptions`
  );
  return result.rows[0];
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
  const result = await pool.query(
    `SELECT * FROM "auto_print_config" WHERE "enabled" = true`
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
     WHERE c."agent_token" = $1 AND c."enabled" = true`,
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

export async function addPrintQueueJob(userId: number, shipmentId: number, zpl: string) {
  // INSERT ... ON CONFLICT DO NOTHING so we never duplicate a shipment already queued
  const result = await pool.query(
    `INSERT INTO "print_queue" ("user_id", "shipment_id", "zpl", "status")
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT ("user_id", "shipment_id") DO NOTHING
     RETURNING *`,
    [userId, shipmentId, zpl]
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
       WHERE "user_id" = $1 AND "status" = 'pending'
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
 * Reclaim jobs stuck in 'processing' for too long (agent died mid-print).
 * Jobs claimed more than `staleMs` ago are reset to 'pending' (retryable).
 */
export async function releaseStaleJobs(staleMs = 5 * 60 * 1000) {
  const result = await pool.query(
    `UPDATE "print_queue" SET
       "status" = 'pending',
       "claimed_at" = NULL,
       "claimed_by" = NULL,
       "last_error" = COALESCE("last_error", 'stale_processing_reclaimed'),
       "updated_at" = CURRENT_TIMESTAMP
     WHERE "status" = 'processing'
       AND "claimed_at" IS NOT NULL
       AND "claimed_at" < CURRENT_TIMESTAMP - ($1 || ' milliseconds')::INTERVAL
     RETURNING id, user_id`,
    [String(staleMs)]
  );
  return result.rows;
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

export async function markPrintJobPrinted(userId: number, jobId: number) {
  const result = await pool.query(
    `UPDATE "print_queue" SET "status" = 'printed', "printed_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "user_id" = $2`,
    [jobId, userId]
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
 * Try to record a webhook event. Returns true if it's new (should process),
 * false if it was already processed (idempotent skip).
 */
export async function recordWebhookEventIfNew(provider: string, eventKey: string, payload?: any): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO "webhook_events" ("provider", "event_key", "payload") VALUES ($1, $2, $3)`,
      [provider, eventKey, payload ? JSON.stringify(payload) : null]
    );
    return true;
  } catch (err: any) {
    // Unique violation → already processed
    if (err.code === '23505') return false;
    throw err;
  }
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
 * Record an ML notification if new. Returns true if new (should process),
 * false if duplicate (idempotent skip).
 */
export async function recordMLNotificationIfNew(topic: string, resource: string, userId?: number, payload?: any): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO "ml_notifications" ("topic", "resource", "user_id", "payload") VALUES ($1, $2, $3, $4)`,
      [topic, resource, userId ?? null, payload ? JSON.stringify(payload) : null]
    );
    return true;
  } catch (err: any) {
    if (err.code === '23505') return false; // unique violation → duplicate
    throw err;
  }
}

export async function markMLNotificationProcessed(topic: string, resource: string) {
  await pool.query(
    `UPDATE "ml_notifications" SET "processed" = true WHERE "topic" = $1 AND "resource" = $2`,
    [topic, resource]
  );
}

export default pool;
