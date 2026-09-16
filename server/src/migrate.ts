import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Versioned migration runner. Tracks applied migrations in `schema_migrations`.
 * Idempotent and backwards compatible: only runs pending migrations.
 *
 * Migrations live in `server/migrations/*.sql` and are applied in filename order.
 * In production (compiled), migrations are copied next to dist/ via the build.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "version" VARCHAR(255) PRIMARY KEY,
        "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = resolveMigrationsDir();
    if (!fs.existsSync(migrationsDir)) {
      console.warn('⚠️  No migrations directory found — skipping migrations');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = new Set<string>(
      (await client.query('SELECT "version" FROM "schema_migrations"')).rows.map((r) => r.version)
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`📦 Applying migration ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "schema_migrations" ("version") VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Migration ${file} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    client.release();
  }
}

function resolveMigrationsDir(): string {
  // When running via tsx (src/migrate.ts), migrations are at ../migrations
  // When running compiled (dist/migrate.js), migrations are at ../migrations
  // (nixpacks build copies them — see build script).
  const candidates = [
    path.join(__dirname, '..', 'migrations'),
    path.join(__dirname, '..', '..', 'migrations'),
    path.join(process.cwd(), 'server', 'migrations'),
    path.join(process.cwd(), 'migrations'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}
