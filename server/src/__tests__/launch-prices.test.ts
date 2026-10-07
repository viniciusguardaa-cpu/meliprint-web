import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { checkoutMatchesOffer } from '../services/checkoutOffer.js';

const offer = (amount: number | string, plan_id = 'start', currency = 'BRL') => ({ amount, plan_id, currency });

describe('checkout replay at changed launch prices', () => {
  it('does not reuse Start 29.90 for the new 7.90 offer', () => {
    const old = offer('29.90');
    expect(checkoutMatchesOffer(old, 'start', 7.90, 'BRL')).toBe(false);
    expect(old.amount).toBe('29.90');
  });
  it('does not reuse Pro 59.90 for the new 19.90 offer', () => {
    expect(checkoutMatchesOffer(offer('59.90', 'pro'), 'pro', 19.90, 'BRL')).toBe(false);
  });
  it('allows same-offer retries and replays, including PG decimal strings', () => {
    expect(checkoutMatchesOffer(offer('7.90'), 'start', 7.90, 'BRL')).toBe(true);
    expect(checkoutMatchesOffer(offer(19.90, 'pro'), 'pro', 19.90, 'BRL')).toBe(true);
  });
  it('rejects changed plan, currency and invalid amounts', () => {
    expect(checkoutMatchesOffer(offer(7.90), 'pro', 7.90, 'BRL')).toBe(false);
    expect(checkoutMatchesOffer(offer(7.90), 'start', 7.90, 'USD')).toBe(false);
    expect(checkoutMatchesOffer(offer('invalid'), 'start', 7.90, 'BRL')).toBe(false);
  });
});

it('migration changes the offers and disables experiments, not existing contracts', () => {
  const sql = fs.readFileSync(new URL('../../migrations/0013_launch_prices.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '');
  expect(statements).toContain('7.90');
  expect(statements).toContain('19.90');
  expect(statements).toContain("'founder', 'LabelGo Completo - Fundador'");
  expect(statements).toContain("'is_active'".replaceAll("'", '"') + ' = false');
  expect(statements).toContain('SELECT');
  expect(statements).toContain('\"auto_print\", \"sla_queue\", \"packing_check\", \"print_history\"');
  expect(statements).toContain('"is_active" = false');
  expect(statements).not.toMatch(/subscriptions|checkout_sessions|billing_events/);
});

it('route blocks mismatched replay before returning a URL or retrying MP', () => {
  const route = fs.readFileSync(new URL('../routes/subscription.ts', import.meta.url), 'utf8');
  const guard = route.indexOf('if (!checkoutMatchesOffer(');
  expect(guard).toBeGreaterThan(0);
  expect(guard).toBeLessThan(route.indexOf("session.status === 'completed'"));
  expect(guard).toBeLessThan(route.indexOf('await retryCheckoutSession'));
  expect(route).toContain('price: Number(session.amount)');
  expect(route).toContain('Number(req.body.offeredAmount) !== price.amount');
});
