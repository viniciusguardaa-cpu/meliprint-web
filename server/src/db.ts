import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

export default pool;
