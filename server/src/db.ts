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
  const client = await pool.connect();
  try {
    // Create session table if not exists (required by connect-pg-simple)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);
    
    // Create index for session expiration cleanup
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "ml_user_id" BIGINT UNIQUE NOT NULL,
        "nickname" VARCHAR(255) NOT NULL,
        "email" VARCHAR(255),
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER REFERENCES "users"("id") ON DELETE CASCADE,
        "mp_preapproval_id" VARCHAR(255) UNIQUE,
        "mp_payer_id" VARCHAR(255),
        "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
        "plan_id" VARCHAR(100) DEFAULT 'monthly_29_90',
        "price" DECIMAL(10,2) DEFAULT 29.90,
        "current_period_start" TIMESTAMP,
        "current_period_end" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_user_id" ON "subscriptions" ("user_id");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_status" ON "subscriptions" ("status");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_ml_user_id" ON "users" ("ml_user_id");
    `);

    // Create free_access table (manual courtesy access, granted from the admin panel)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "free_access" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "note" VARCHAR(255),
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create auto_print_config table (stores ML tokens + agent token for the local print agent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "auto_print_config" (
        "user_id" INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "ml_access_token" TEXT,
        "ml_refresh_token" TEXT,
        "ml_token_expires_at" BIGINT,
        "ml_seller_id" BIGINT,
        "agent_token" VARCHAR(255) UNIQUE,
        "printer_name" VARCHAR(255),
        "last_polled_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create print_queue table (pending print jobs with ZPL, consumed by the local agent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "print_queue" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "shipment_id" BIGINT NOT NULL,
        "zpl" TEXT,
        "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "error" TEXT,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "printed_at" TIMESTAMP,
        UNIQUE("user_id", "shipment_id")
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_print_queue_status" ON "print_queue" ("status");
    `);

    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
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
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'printed') AS printed,
       (SELECT COUNT(*) FROM "print_queue" WHERE "user_id" = $1 AND "status" = 'failed') AS failed`,
    [userId]
  );
  return result.rows[0];
}

export default pool;
