import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool — we verify SQL + simulate concurrency/unique violations.
// NOTE: use mockClear (not mockReset) + *Once implementations — persistent
// rejected mocks across reset boundaries are reported as unhandled rejections
// by vitest's worker even when the call site awaits them.
const mockQuery = vi.fn();
vi.mock('pg', () => {
  const mPool = {
    query: mockQuery,
    connect: vi.fn(),
    on: vi.fn(),
  };
  return { default: { Pool: vi.fn(() => mPool) }, Pool: vi.fn(() => mPool) };
});

vi.mock('../services/crypto.js', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => (v?.startsWith('enc:') ? v.slice(4) : v),
  isLegacyPlaintext: (v: string) => typeof v === 'string' && v.length > 0 && !v.startsWith('enc:'),
}));

const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('trial uniqueness (one per account, survives cancellation)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('hasUsedTrial reads users.trial_started_at, not the subscription row', async () => {
    const { hasUsedTrial } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ trial_started_at: new Date() }] });

    const used = await hasUsedTrial(42);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"trial_started_at"');
    expect(sql).toContain('FROM "users"');
    expect(params).toEqual([42]);
    expect(used).toBe(true);
  });

  it('hasUsedTrial returns false when trial never started', async () => {
    const { hasUsedTrial } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ trial_started_at: null }] });
    expect(await hasUsedTrial(42)).toBe(false);

    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await hasUsedTrial(42)).toBe(false);
  });

  it('markTrialUsed stamps trial_started_at only once (COALESCE)', async () => {
    const { markTrialUsed } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await markTrialUsed(42);

    const [sql] = mockQuery.mock.calls[0];
    // COALESCE preserves the first timestamp — a second call cannot reset it.
    expect(sql).toContain('COALESCE("trial_started_at", CURRENT_TIMESTAMP)');
  });
});

describe('entitlement (access period vs billing state)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('getEntitledSubscription covers in-window trial and cancelled-in-period', async () => {
    const { getEntitledSubscription } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getEntitledSubscription(42);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("'trialing'");
    expect(sql).toContain('"trial_ends_at" > CURRENT_TIMESTAMP');
    // Cancelled subscriptions keep access until the contracted period ends.
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain('"current_period_end" > CURRENT_TIMESTAMP');
  });

  it('hasProAccess checks the plan feature AND free_access fallback', async () => {
    const { hasProAccess } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ has_access: true }] });

    const result = await hasProAccess(42);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('p."auto_print" = true');
    expect(sql).toContain('"free_access"');
    expect(result).toBe(true);
  });
});

describe('checkout idempotency (concurrent + failure recovery)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('startCheckoutSession inserts a processing row before calling MP', async () => {
    const { startCheckoutSession } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, status: 'processing' }] });

    const r = await startCheckoutSession(42, 'key-1', 'pro', 3, 59.9, 'BRL');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "checkout_sessions"');
    expect(sql).toContain("'processing'");
    expect(params).toEqual([42, 'key-1', 'pro', 3, 59.9, 'BRL']);
    expect(r.created).toBe(true);
  });

  it('concurrent request hitting the unique key returns the existing session', async () => {
    const { startCheckoutSession } = await import('../db.js');
    mockQuery
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ rows: [{ id: 7, status: 'completed', checkout_url: 'https://mp/check' }] });

    const r = await startCheckoutSession(42, 'key-1', 'pro', 3, 59.9, 'BRL');

    expect(r.created).toBe(false);
    expect(r.session.checkout_url).toBe('https://mp/check');
    // Second query is the lookup of the conflicting row.
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toContain('"idempotency_key" = $2');
    expect(params).toEqual([42, 'key-1']);
  });

  it('retryCheckoutSession only re-opens failed sessions', async () => {
    const { retryCheckoutSession } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await retryCheckoutSession(7);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("'failed'");
    expect(sql).toContain("'processing'");
  });
});

describe('webhook event dedup (different events per subscription + retry)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('first delivery records a new event', async () => {
    const { recordWebhookEvent } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const r = await recordWebhookEvent('mercadopago', 'mp:sub:123:delivery-1', { id: 1 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "webhook_events"');
    expect(params[1]).toBe('mp:sub:123:delivery-1');
    expect(r).toBe('new');
  });

  it('repeat delivery of a FAILED event returns retry (not lost)', async () => {
    const { recordWebhookEvent } = await import('../db.js');
    mockQuery
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'failed' }] });

    const r = await recordWebhookEvent('mercadopago', 'mp:sub:123:delivery-1');

    expect(r).toBe('retry');
    const [sql] = mockQuery.mock.calls[1];
    expect(sql).toContain('"status" = \'failed\'');
    expect(sql).toContain('"attempts" = "attempts" + 1');
  });

  it('repeat delivery of a PROCESSED event is a duplicate', async () => {
    const { recordWebhookEvent } = await import('../db.js');
    mockQuery
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const r = await recordWebhookEvent('mercadopago', 'mp:sub:123:delivery-1');
    expect(r).toBe('duplicate');
  });
});

describe('ML notification dedup (per delivery, successive shipment updates)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('new delivery on the same resource is recorded', async () => {
    const { recordMLNotificationIfNew } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 9 }] });

    const id = await recordMLNotificationIfNew('shipments', '/shipments/55', 'delivery-B', 42);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"delivery_key"');
    expect(params).toEqual(['shipments', '/shipments/55', 'delivery-B', 42, null]);
    expect(id).toBe(9);
  });

  it('same delivery retried by ML returns null (dedup by delivery_key)', async () => {
    const { recordMLNotificationIfNew } = await import('../db.js');
    mockQuery.mockRejectedValueOnce(uniqueViolation());

    const id = await recordMLNotificationIfNew('shipments', '/shipments/55', 'delivery-B', 42);
    expect(id).toBeNull();
  });
});

describe('print queue reliability (uncertain outcomes → needs_review)', () => {
  beforeEach(() => mockQuery.mockClear());

  it('releaseStaleJobs moves stuck processing jobs to needs_review, NOT pending', async () => {
    const { releaseStaleJobs } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 42 }] });

    await releaseStaleJobs();

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("'needs_review'");
    expect(sql).not.toContain("'pending'");
    expect(sql).toContain('agent_lost_contact_uncertain');
  });

  it('resolveJobReview requeue requires needs_review + owner scope', async () => {
    const { resolveJobReview } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await resolveJobReview(42, 5, 'requeue');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $2');
    expect(sql).toContain("'needs_review'");
    expect(sql).toContain("'pending'");
    expect(params).toEqual([5, 42]);
  });

  it('resolveJobReview confirm_printed marks printed with timestamps', async () => {
    const { resolveJobReview } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await resolveJobReview(42, 5, 'confirm_printed');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("'printed'");
    expect(sql).toContain('"confirmed_at"');
  });

  it('consumePairingCode is atomic (used_at IS NULL + not expired)', async () => {
    const { consumePairingCode } = await import('../db.js');
    mockQuery.mockResolvedValueOnce({ rows: [{ code: 'ABC123', user_id: 42 }] });

    const row = await consumePairingCode('ABC123');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('"used_at" IS NULL');
    expect(sql).toContain('"expires_at" > CURRENT_TIMESTAMP');
    expect(row.user_id).toBe(42);
  });
});
