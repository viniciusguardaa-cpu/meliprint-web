import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

describe('migration files (static checks)', () => {
  it('has sequential, ordered migration files', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    files.forEach((f, i) => {
      const expected = `${String(i + 1).padStart(4, '0')}_`;
      expect(f.startsWith(expected)).toBe(true);
    });
  });

  it('0005_growth.sql does not contain the invalid "UNIQUE" column definition', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0005_growth.sql'), 'utf8');
    // Regression: the original file declared  "UNIQUE" ("referred_user_id")
    // as a column named UNIQUE — invalid SQL that aborted the whole migration.
    expect(sql).not.toMatch(/"UNIQUE"\s*\(/);
    expect(sql).toMatch(/UNIQUE\s*\(\s*"referred_user_id"\s*\)/i);
  });

  it('0006 adds the launch-readiness objects', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0006_launch_readiness.sql'), 'utf8');
    expect(sql).toContain('"checkout_sessions"');
    expect(sql).toContain('"delivery_key"');
    expect(sql).toContain('"last_reconciled_at"');
    expect(sql).toContain('"trial_started_at"');
    expect(sql).toContain('"agent_pairing_codes"');
    expect(sql).toContain("'needs_review'");
  });
});

// ---------------------------------------------------------------------------
// Real-database checks — only when TEST_DATABASE_URL points at a disposable
// Postgres (see server/scripts/test-migrations.sh for the full harness).
// ---------------------------------------------------------------------------

const TEST_DB = process.env.TEST_DATABASE_URL;
const runDb = TEST_DB ? describe : describe.skip;

runDb('migrations against disposable Postgres', () => {
  it('fresh install applies all migrations and preserves data on upgrade', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DB });
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "version" VARCHAR(255) PRIMARY KEY,
        "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

      // Apply every migration except the last one — simulates an existing DB.
      for (const file of files.slice(0, -1)) {
        await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await pool.query('INSERT INTO "schema_migrations" ("version") VALUES ($1)', [file]);
      }

      // Seed data that must survive the upgrade.
      await pool.query(
        `INSERT INTO "users" ("ml_user_id", "nickname") VALUES ($1, $2) RETURNING "id"`,
        [999999001, 'upgrade-test']
      );

      // Apply the last migration (the launch upgrade).
      const last = files[files.length - 1];
      await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, last), 'utf8'));

      const { rows } = await pool.query(
        `SELECT "id", "trial_started_at" FROM "users" WHERE "ml_user_id" = $1`,
        [999999001]
      );
      expect(rows.length).toBe(1);

      // New columns/tables exist.
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions'`
      );
      const names = cols.rows.map((r: any) => r.column_name);
      expect(names).toContain('last_reconciled_at');
    } finally {
      await pool.end();
    }
  }, 60_000);
});
