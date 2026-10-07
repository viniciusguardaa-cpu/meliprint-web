import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db.js', () => ({ default: { query } }));
import { getGrowthMetrics } from '../services/analytics.js';

beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); });
describe('growth period', () => {
  it('uses São Paulo calendar midnight through now, not a rolling 24h, for today', async () => {
    const result = await getGrowthMetrics(-1);
    expect(result.days).toBe(-1);
    for (const [sql, params] of query.mock.calls.slice(0, 6)) {
      expect(sql).toContain("date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')");
      expect(sql).toContain("AT TIME ZONE current_setting('TimeZone')");
      expect(sql).toContain('<= NOW()');
      expect(sql).not.toContain("INTERVAL '1 day'");
      expect(params).toEqual([]);
    }
    const dailySql = query.mock.calls[3][0];
    expect(dailySql).toContain("AT TIME ZONE 'America/Sao_Paulo')::date::text AS day");
    // Preserve all-time conversion checks and the operational counters.
    expect(query.mock.calls[1][0]).toContain('s."created_at" >=');
    expect(query.mock.calls[1][0]).toContain('p."created_at" >=');
    expect(query.mock.calls[6][0]).not.toContain('date_trunc');
    expect(query.mock.calls[7][0]).not.toContain('date_trunc');
  });
  it.each([7, 30, 90])('preserves the %i-day rolling window', async (days) => {
    await getGrowthMetrics(days);
    expect(query.mock.calls[0][0]).toContain("NOW() - ($1::int * INTERVAL '1 day')");
    expect(query.mock.calls[0][1]).toEqual([days]);
  });
  it('preserves all time without a date restriction', async () => {
    await getGrowthMetrics(0);
    expect(query.mock.calls[0][0]).not.toContain('date_trunc');
    expect(query.mock.calls[0][0]).not.toContain('"created_at" >=');
    expect(query.mock.calls[0][1]).toEqual([]);
  });
});
