import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pool, {
  upsertAutoPrintConfig, initializeShopeeAutoPrint, getShopeeAutoPrintState,
  addPdfPrintQueueJob, addPrintQueueJob, claimPrintJobs, markShopeeConversionFailed,
  markPrintJobFailed, markPrintJobPrinted, releaseStaleJobs, resolveJobReview,
  getQueuedShipmentIds
} from '../db.js';

// Opt-in disposable DB only. Isolate all DDL/data in a per-suite schema; never
// read DATABASE_URL or import the app (which loads production dotenv settings).
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('Shopee queue on disposable PostgreSQL', () => {
  const schema = `shopee_test_${randomUUID().replaceAll('-', '')}`;
  let db: pg.Pool;
  let admin: pg.Pool;
  let owner: number; let other: number; let shop: number; let shop2: number;
  let generation: string;
  const migrationDir = new URL('../../migrations/', import.meta.url);
  const files = readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
  const scope = () => ({ accountId: shop, generation });
  const pdf = Buffer.from('%PDF-mock');
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    for (const file of files) await db.query(readFileSync(new URL(file, migrationDir), 'utf8'));
    vi.spyOn(pool, 'query').mockImplementation(((...args: any[]) => (db.query as any)(...args)) as any);
  }, 60_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (db) await db.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await db.query('TRUNCATE "users" CASCADE');
    const users = await db.query(`INSERT INTO users (nickname) VALUES ('owner'), ('other') RETURNING id`);
    [owner, other] = users.rows.map(r => r.id);
    const accounts = await db.query(`INSERT INTO marketplace_accounts (user_id, provider, external_user_id)
      VALUES ($1, 'shopee', 'shop-a'), ($1, 'shopee', 'shop-b') RETURNING id`, [owner]);
    [shop, shop2] = accounts.rows.map(r => r.id);
    generation = (await upsertAutoPrintConfig(owner, { enabled: true })).shopee_generation;
    await upsertAutoPrintConfig(other, { enabled: true });
    await initializeShopeeAutoPrint(owner, scope(), ['OLD', 'WAITING_DOCUMENT']);
    await initializeShopeeAutoPrint(owner, { accountId: shop2, generation }, []);
  });
  it('rejects backlog/wrong owner/stale generation and deduplicates concurrent inserts per store', async () => {
    expect(await addPdfPrintQueueJob(owner, 'OLD', pdf, 'shopee', scope())).toBeNull();
    expect(await addPdfPrintQueueJob(other, 'NEW', pdf, 'shopee', scope())).toBeNull();
    expect(await addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', { ...scope(), generation: randomUUID() })).toBeNull();
    const results = await Promise.all(Array.from({ length: 5 }, () => addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', scope())));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', { accountId: shop2, generation })).toBeTruthy();
    expect(await getQueuedShipmentIds(owner, 'shopee', shop)).toEqual(new Set(['NEW']));
    expect((await db.query('SELECT * FROM print_queue')).rowCount).toBe(2);
  });
  it('two agents atomically claim disjoint jobs, with no cross-tenant delivery', async () => {
    for (let i = 0; i < 6; i++) await addPdfPrintQueueJob(owner, `NEW${i}`, pdf, 'shopee', scope());
    const claims = await Promise.all([claimPrintJobs(owner, 'a', 3), claimPrintJobs(owner, 'b', 3)]);
    const ids = claims.flat().map(job => job.id);
    expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
    expect(await claimPrintJobs(other, 'foreign', 20, ['zpl', 'pdf'])).toEqual([]);
    expect(await markPrintJobPrinted(other, ids[0])).toBe(false);
  });
  it('re-activation establishes a new snapshot and never releases queued jobs from the earlier activation', async () => {
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', scope());
    await upsertAutoPrintConfig(owner, { enabled: false });
    expect(await claimPrintJobs(owner, 'a')).toEqual([]);
    const next = (await upsertAutoPrintConfig(owner, { enabled: true })).shopee_generation;
    expect(next).not.toBe(generation);
    expect(await getShopeeAutoPrintState(owner, { accountId: shop, generation: next })).toBeNull();
    await initializeShopeeAutoPrint(owner, { accountId: shop, generation: next }, ['NEW']);
    expect(await claimPrintJobs(owner, 'a')).toEqual([]);
    expect((await db.query('SELECT status FROM print_queue WHERE id=$1', [job.id])).rows[0].status).toBe('needs_review');
    // Explicit owner resolution preserves the existing manual retry operation.
    await resolveJobReview(owner, job.id, 'requeue');
    expect((await claimPrintJobs(owner, 'a')).map(j => j.id)).toEqual([job.id]);
  });
  it('uses delayed, bounded conversion retries and ignores duplicate failure reports', async () => {
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', scope());
    for (let n = 1; n <= 3; n++) {
      expect(await claimPrintJobs(owner, 'a')).toHaveLength(1);
      await markShopeeConversionFailed(owner, job.id, 'render failed');
      await markShopeeConversionFailed(owner, job.id, 'same failure repeated');
      const row = (await db.query('SELECT * FROM print_queue WHERE id=$1', [job.id])).rows[0];
      expect(row.attempts).toBe(n);
      expect(row.status).toBe(n < 3 ? 'pending' : 'failed');
      expect(await claimPrintJobs(owner, 'a')).toEqual([]);
      await db.query(`UPDATE print_queue SET next_attempt_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=$1`, [job.id]);
    }
    expect(await claimPrintJobs(owner, 'a')).toEqual([]);
  });
  it('sends uncertain outcomes to review, accepts late confirmations and prevents failure from undoing confirmation', async () => {
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'shopee', scope());
    await claimPrintJobs(owner, 'a');
    await db.query(`UPDATE print_queue SET claimed_at=CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id=$1`, [job.id]);
    await releaseStaleJobs();
    expect(await claimPrintJobs(owner, 'b')).toEqual([]);
    expect(await markPrintJobPrinted(owner, job.id)).toBe(true);
    expect(await markPrintJobPrinted(owner, job.id)).toBe(true);
    expect(await markPrintJobFailed(owner, job.id, 'delayed failure')).toBe(false);
    const next = await addPdfPrintQueueJob(owner, 'NEW2', pdf, 'shopee', scope());
    await claimPrintJobs(owner, 'a');
    await markPrintJobFailed(owner, next.id, 'printer outcome uncertain');
    expect((await db.query('SELECT status FROM print_queue WHERE id=$1', [next.id])).rows[0].status).toBe('needs_review');
    expect(await claimPrintJobs(owner, 'b')).toEqual([]);
  });
  it('parks pre-upgrade Shopee PDF jobs while preserving the ML ZPL queue and its deduplication', async () => {
    await db.query(`INSERT INTO print_queue (user_id, provider, shipment_id, zpl, content_type)
      VALUES ($1, 'shopee', 'LEGACY', 'JVBERg==', 'pdf')`, [owner]);
    const ml = await addPrintQueueJob(owner, '123', '^XA^FDML^FS^XZ');
    expect(await addPrintQueueJob(owner, '123', '^XA^XZ')).toBeNull();
    await db.query(readFileSync(new URL('0017_shopee_auto_print.sql', migrationDir), 'utf8'));
    const claimed = await claimPrintJobs(owner, 'old');
    expect(claimed.map(j => j.id)).toEqual([ml.id]);
    expect(claimed[0].zpl).toBe('^XA^FDML^FS^XZ');
    expect((await db.query(`SELECT status FROM print_queue WHERE shipment_id='LEGACY'`)).rows[0].status).toBe('needs_review');
  });
});
