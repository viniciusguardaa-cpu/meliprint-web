import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { pollAutoPrintUser } from '../jobs/autoPrintPoller.js';
import { claimAgentPrintJobs } from '../services/agentPrintJobs.js';
import { getFreshAccountContext } from '../services/accounts.js';
import pool, {
  upsertAutoPrintConfig, initializeMarketplaceAutoPrint, getMarketplaceAutoPrintState, reserveTikTokLabelAttempt,
  addPdfPrintQueueJob, addPrintQueueJob, claimPrintJobs, markShopeeConversionFailed,
  markPrintJobFailed, markPrintJobPrinted, releaseStaleJobs, resolveJobReview,
  getQueuedShipmentIds, updateMarketplaceAccountTokens, getPrintedShipmentIdsForAccount, getMarketplaceAccountById
} from '../db.js';

// Opt-in disposable DB only. Isolate all DDL/data in a per-suite schema; never
// read DATABASE_URL or import the app (which loads production dotenv settings).
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('TikTok queue on disposable PostgreSQL', () => {
  const schema = `tiktok_test_${randomUUID().replaceAll('-', '')}`;
  let db: pg.Pool;
  let admin: pg.Pool;
  let owner: number; let other: number; let shop: number; let shop2: number;
  let generation: string;
  const migrationDir = new URL('../../migrations/', import.meta.url);
  const files = readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
  const scope = () => ({ accountId: shop, generation });
  const pdf = Buffer.from('%PDF-mock');
  beforeAll(async () => {
    vi.stubEnv('TIKTOK_ENABLED', '1');
    admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    for (const file of files) await db.query(readFileSync(new URL(file, migrationDir), 'utf8'));
    vi.spyOn(pool, 'query').mockImplementation(((...args: any[]) => (db.query as any)(...args)) as any);
    vi.spyOn(pool, 'connect').mockImplementation((() => db.connect()) as any);
  }, 60_000);
  afterAll(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    if (db) await db.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await db.query('TRUNCATE "users" CASCADE');
    const users = await db.query(`INSERT INTO users (nickname) VALUES ('owner'), ('other') RETURNING id`);
    [owner, other] = users.rows.map(r => r.id);
    const accounts = await db.query(`INSERT INTO marketplace_accounts (user_id, provider, external_user_id)
      VALUES ($1, 'tiktok', 'shop-a'), ($1, 'tiktok', 'shop-b') RETURNING id`, [owner]);
    [shop, shop2] = accounts.rows.map(r => r.id);
    generation = (await upsertAutoPrintConfig(owner, { enabled: true })).shopee_generation;
    await upsertAutoPrintConfig(other, { enabled: true });
    await initializeMarketplaceAutoPrint(owner, scope(), ['OLD', 'WAITING_DOCUMENT'], 'tiktok');
    await initializeMarketplaceAutoPrint(owner, { accountId: shop2, generation }, [], 'tiktok');
  });
  it('rejects backlog/wrong owner/stale generation and deduplicates concurrent inserts per store', async () => {
    expect(await addPdfPrintQueueJob(owner, 'OLD', pdf, 'tiktok', scope())).toBeNull();
    expect(await addPdfPrintQueueJob(other, 'NEW', pdf, 'tiktok', scope())).toBeNull();
    expect(await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', { ...scope(), generation: randomUUID() })).toBeNull();
    const results = await Promise.all(Array.from({ length: 5 }, () => addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', scope())));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', { accountId: shop2, generation })).toBeTruthy();
    expect(await getQueuedShipmentIds(owner, 'tiktok', shop)).toEqual(new Set(['NEW']));
    expect((await db.query('SELECT * FROM print_queue')).rowCount).toBe(2);
  });
  it('two agents atomically claim disjoint jobs, with no cross-tenant delivery', async () => {
    for (let i = 0; i < 6; i++) await addPdfPrintQueueJob(owner, `NEW${i}`, pdf, 'tiktok', scope());
    const claims = await Promise.all([claimPrintJobs(owner, 'a', 3), claimPrintJobs(owner, 'b', 3)]);
    const ids = claims.flat().map(job => job.id);
    expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
    expect(await claimPrintJobs(other, 'foreign', 20, ['zpl', 'pdf'])).toEqual([]);
    expect(await markPrintJobPrinted(other, ids[0])).toBe(false);
  });
  it('re-activation establishes a new snapshot and never releases queued jobs from the earlier activation', async () => {
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', scope());
    await upsertAutoPrintConfig(owner, { enabled: false });
    expect(await claimPrintJobs(owner, 'a')).toEqual([]);
    const next = (await upsertAutoPrintConfig(owner, { enabled: true })).shopee_generation;
    expect(next).not.toBe(generation);
    expect(await getMarketplaceAutoPrintState(owner, { accountId: shop, generation: next }, 'tiktok')).toBeNull();
    await initializeMarketplaceAutoPrint(owner, { accountId: shop, generation: next }, ['NEW'], 'tiktok');
    expect(await claimPrintJobs(owner, 'a')).toEqual([]);
    expect((await db.query('SELECT status FROM print_queue WHERE id=$1', [job.id])).rows[0].status).toBe('needs_review');
    // Explicit owner resolution preserves the existing manual retry operation.
    await resolveJobReview(owner, job.id, 'requeue');
    expect((await claimPrintJobs(owner, 'a')).map(j => j.id)).toEqual([job.id]);
  });
  it('uses delayed, bounded conversion retries and ignores duplicate failure reports', async () => {
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', scope());
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
    const job = await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', scope());
    await claimPrintJobs(owner, 'a');
    await db.query(`UPDATE print_queue SET claimed_at=CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id=$1`, [job.id]);
    await releaseStaleJobs();
    expect(await claimPrintJobs(owner, 'b')).toEqual([]);
    expect(await markPrintJobPrinted(owner, job.id)).toBe(true);
    expect(await markPrintJobPrinted(owner, job.id)).toBe(true);
    expect(await markPrintJobFailed(owner, job.id, 'delayed failure')).toBe(false);
    const next = await addPdfPrintQueueJob(owner, 'NEW2', pdf, 'tiktok', scope());
    await claimPrintJobs(owner, 'a');
    await markPrintJobFailed(owner, next.id, 'printer outcome uncertain');
    expect((await db.query('SELECT status FROM print_queue WHERE id=$1', [next.id])).rows[0].status).toBe('needs_review');
    expect(await claimPrintJobs(owner, 'b')).toEqual([]);
  });
  it('reserves preparation attempts atomically with persistent backoff and a hard limit', async () => {
    expect(await reserveTikTokLabelAttempt(other, scope(), 'NEW')).toBe(false);
    expect(await reserveTikTokLabelAttempt(owner, scope(), 'OLD')).toBe(false);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveTikTokLabelAttempt(owner, scope(), 'NEW')));
    expect(results.filter(Boolean)).toHaveLength(1);
    for (let attempt = 2; attempt <= 3; attempt++) {
      await db.query(`UPDATE tiktok_label_attempts SET next_attempt_at=CURRENT_TIMESTAMP - INTERVAL '1 second'`);
      expect(await reserveTikTokLabelAttempt(owner, scope(), 'NEW')).toBe(true);
      expect(await reserveTikTokLabelAttempt(owner, scope(), 'NEW')).toBe(false);
    }
    await db.query(`UPDATE tiktok_label_attempts SET next_attempt_at=CURRENT_TIMESTAMP - INTERVAL '1 day'`);
    expect(await reserveTikTokLabelAttempt(owner, scope(), 'NEW')).toBe(false);
    expect((await db.query('SELECT attempts FROM tiktok_label_attempts')).rows[0].attempts).toBe(3);
  });
  it('feature flag stops TikTok claims while leaving the ML queue untouched', async () => {
    await addPdfPrintQueueJob(owner, 'NEW', pdf, 'tiktok', scope());
    const ml = await addPrintQueueJob(owner, '123', '^XA^FDML^FS^XZ');
    vi.stubEnv('TIKTOK_ENABLED', '0');
    expect((await claimPrintJobs(owner, 'old')).map(j => j.id)).toEqual([ml.id]);
    vi.stubEnv('TIKTOK_ENABLED', '1');
    expect(await claimPrintJobs(owner, 'old')).toHaveLength(1);
  });
  it('runs discovery → real PDF storage → legacy ZPL rendering → ack, without a printer or duplicate delivery', async () => {
    vi.stubEnv('TIKTOK_APP_KEY', 'test-key'); vi.stubEnv('TIKTOK_APP_SECRET', 'test-secret'); vi.stubEnv('TIKTOK_SERVICE_ID', 'test-service');
    const shopId = '9000000000000000001'; const packageId = '9000000000000000101'; const oldPackage = '9000000000000000102';
    await db.query(`UPDATE marketplace_accounts SET external_user_id=$2 WHERE id=$1`, [shop, shopId]);
    await db.query(`UPDATE marketplace_accounts SET status='reauth_required' WHERE id=$1`, [shop2]);
    await updateMarketplaceAccountTokens(shop, { accessToken: 'test-token', refreshToken: 'test-refresh', expiresAt: Date.now() + 3600000 });
    await db.query('DELETE FROM shopee_auto_print_state WHERE account_id=$1', [shop]);
    const document = await PDFDocument.create(); document.addPage([297.64, 419.53]).drawText('TESTE TIKTOK 123456789');
    const bytes = new Uint8Array(await document.save());
    let fresh = false; let downloads = 0;
    const now = Math.floor(Date.now() / 1000);
    const order = { id: '9000000000000000201', create_time: now - 30, status: 'AWAITING_COLLECTION', shipping_type: 'TIKTOK',
      fulfillment_type: 'FULFILLMENT_BY_SELLER', need_upload_invoice: 'INVOICE_UPLOADED', packages: [{ id: packageId }] };
    const old = { ...order, id: '9000000000000000202', create_time: now - 3600, packages: [{ id: oldPackage }] };
    const reply = (data: unknown) => new Response(JSON.stringify({ code: 0, data }));
    vi.stubGlobal('fetch', vi.fn(async (input: URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'p16-oec.byteoversea.com') { downloads++; return new Response(bytes); }
      expect((init?.headers as Record<string, string>)['x-tts-access-token']).toBe('test-token');
      if (url.pathname === '/authorization/202309/shops') return reply({ shops: [{ id: shopId, name: 'Loja teste', region: 'BR', cipher: 'owned-cipher' }] });
      expect(url.searchParams.get('shop_cipher')).toBe('owned-cipher');
      if (url.pathname.endsWith('/orders/search')) {
        const filter = JSON.parse(init?.body as string);
        const orders = (fresh ? [old, order] : [old]).filter(o => !filter.create_time_ge || o.create_time >= filter.create_time_ge);
        return reply({ orders, total_count: orders.length });
      }
      if (url.pathname === '/order/202309/orders') return reply({ orders: [order] });
      if (url.pathname.endsWith('/shipping_documents')) return reply({ doc_url: 'https://p16-oec.byteoversea.com/label.pdf' });
      if (url.pathname.endsWith('/' + packageId)) return reply({ package_id: packageId, orders: [{ id: order.id }], shipping_type: 'TIKTOK', package_status: 'PROCESSING', package_sub_status: 'RTS' });
      throw new Error('Unexpected request');
    }));
    const config = { user_id: owner, enabled: true, shopee_generation: generation };
    await pollAutoPrintUser(config, 'tiktok');
    expect((await getMarketplaceAutoPrintState(owner, scope(), 'tiktok'))?.excluded_ids).toEqual([oldPackage]);
    expect(downloads).toBe(0); expect(await claimPrintJobs(owner, 'existing-agent')).toEqual([]);
    // Time passes between activation and the arrival of a new order.
    await db.query(`UPDATE shopee_auto_print_state SET initialized_at=CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE account_id=$1`, [shop]);
    fresh = true;
    await pollAutoPrintUser(config, 'tiktok');
    const saved = (await db.query('SELECT * FROM print_queue')).rows;
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ provider: 'tiktok', account_id: shop, shipment_id: packageId, content_type: 'pdf' });
    expect((await db.query('SELECT access_token FROM marketplace_accounts WHERE id=$1', [shop])).rows[0].access_token).toMatch(/^enc:v1:/);
    const jobs = await claimAgentPrintJobs(owner, 'existing-agent', 5, ['zpl'], 300);
    expect(jobs).toHaveLength(1); expect(jobs[0].id).toBe(saved[0].id);
    expect(jobs[0].content_type).toBe('zpl'); expect(jobs[0].zpl).toContain('^XA'); expect(jobs[0].zpl).toContain('^GFA');
    await markPrintJobPrinted(owner, jobs[0].id);
    expect(await getPrintedShipmentIdsForAccount(owner, shop, 'tiktok')).toEqual(new Set([packageId]));
    expect(await getPrintedShipmentIdsForAccount(other, shop, 'tiktok')).toEqual(new Set());
    await pollAutoPrintUser(config, 'tiktok');
    expect(downloads).toBe(1); expect(await claimPrintJobs(owner, 'second-agent')).toEqual([]);
    expect((await db.query('SELECT status FROM print_queue')).rows[0].status).toBe('printed');
    vi.unstubAllGlobals();
  }, 15000);
  it('serializes refresh-token rotation across concurrent requests and re-reads persisted tokens', async () => {
    vi.stubEnv('TIKTOK_APP_KEY', 'test-key'); vi.stubEnv('TIKTOK_APP_SECRET', 'test-secret'); vi.stubEnv('TIKTOK_SERVICE_ID', 'test-service');
    const shopId = '9000000000000000001';
    await db.query('UPDATE marketplace_accounts SET external_user_id=$2 WHERE id=$1', [shop, shopId]);
    await updateMarketplaceAccountTokens(shop, { accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: Date.now() - 10000 });
    const stale = await getMarketplaceAccountById(shop);
    let exchanges = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const url = new URL(String(input));
      if (url.hostname === 'auth.tiktok-shops.com') {
        exchanges++; await new Promise(resolve => setTimeout(resolve, 30));
        expect(url.searchParams.get('refresh_token')).toBe('old-refresh');
        return new Response(JSON.stringify({ code: 0, data: { access_token: 'rotated', refresh_token: 'rotated-refresh', access_token_expire_in: Math.floor(Date.now() / 1000) + 604800,
          user_type: 0, granted_scopes: ['seller.authorization.info', 'seller.order.info', 'seller.fulfillment.basic'] } }));
      }
      return new Response(JSON.stringify({ code: 0, data: { shops: [{ id: shopId, name: 'Demo', region: 'BR', cipher: 'owned' }] } }));
    }));
    const results = await Promise.all([getFreshAccountContext(stale), getFreshAccountContext(stale)]);
    expect(results.filter(Boolean)).toHaveLength(1); expect(exchanges).toBe(1);
    const refreshed = await getFreshAccountContext(stale);
    expect(refreshed?.accessToken).toBe('rotated'); expect(refreshed?.refreshToken).toBe('rotated-refresh'); expect(exchanges).toBe(1);
    vi.unstubAllGlobals();
  });
});
