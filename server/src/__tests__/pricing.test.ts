import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db and pricing modules
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

describe('plan entitlement & trial expiration', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('getActiveSubscription includes trialing status', async () => {
    const { getActiveSubscription } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [{ id: 1, status: 'trialing', plan_id: 'pro', trial_ends_at: '2099-01-01' }] });

    const sub = await getActiveSubscription(42);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('trialing');
    expect(mockQuery.mock.calls[0][0]).toContain("'trialing'");
  });

  it('createSubscription saves plan_id, price_id, contracted_amount, trial_ends_at', async () => {
    const { createSubscription } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    const trialEndsAt = new Date('2099-01-01');
    await createSubscription(42, 'trial_42_123', undefined, {
      planId: 'pro',
      priceId: 2,
      contractedAmount: 59.90,
      trialEndsAt,
      idempotencyKey: 'key123',
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('plan_id');
    expect(sql).toContain('price_id');
    expect(sql).toContain('contracted_amount');
    expect(sql).toContain('trial_ends_at');
    expect(sql).toContain('idempotency_key');
    expect(params).toContain('pro');
    expect(params).toContain(2);
    expect(params).toContain(59.90);
    expect(params).toContain('key123');
  });

  it('getActivePlans returns plans with prices from DB', async () => {
    const { getActivePlans } = await import('../services/pricing.js');
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'pro',
        name: 'LabelGo Pro',
        description: 'Pro plan',
        auto_print: true,
        is_active: true,
        sort_order: 2,
        features: JSON.stringify(['auto-print', 'agent']),
        price_id: 2,
        billing_period: 'monthly',
        amount: '59.90',
        currency: 'BRL',
        price_active: true,
      }],
    });

    const plans = await getActivePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('pro');
    expect(plans[0].auto_print).toBe(true);
    expect(plans[0].price).toBeTruthy();
    expect(plans[0].price!.amount).toBe(59.90);
    expect(plans[0].features).toEqual(['auto-print', 'agent']);
  });

  it('getPriceForPlan returns active price for a plan', async () => {
    const { getPriceForPlan } = await import('../services/pricing.js');
    mockQuery.mockResolvedValue({
      rows: [{ id: 2, plan_id: 'pro', billing_period: 'monthly', amount: '59.90', currency: 'BRL', is_active: true }],
    });

    const price = await getPriceForPlan('pro', 'monthly');
    expect(price).toBeTruthy();
    expect(price!.plan_id).toBe('pro');
    expect(price!.amount).toBe(59.90);
  });

  it('planHasAutoPrint returns true for pro, false for start', async () => {
    const { planHasAutoPrint } = await import('../services/pricing.js');

    // Pro plan
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'pro', auto_print: true }] });
    expect(await planHasAutoPrint('pro')).toBe(true);

    // Start plan
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'start', auto_print: false }] });
    expect(await planHasAutoPrint('start')).toBe(false);

    // Nonexistent plan
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await planHasAutoPrint('nonexistent')).toBe(false);
  });
});
