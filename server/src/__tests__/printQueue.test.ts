import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool before importing db functions.
// We capture queries to verify multi-tenant ownership is enforced.
const mockQuery = vi.fn();
vi.mock('../db.js', () => {
  // Re-export everything but override the pool query
  const actual = vi.importActual('../db.js');
  return actual;
});

// We can't easily mock the pool inside db.js, so instead we test the
// SQL construction by mocking pg.Pool at the module level.
vi.mock('pg', () => {
  const mPool = {
    query: mockQuery,
    connect: vi.fn(),
    on: vi.fn(),
  };
  return { default: { Pool: vi.fn(() => mPool) }, Pool: vi.fn(() => mPool) };
});

// Mock crypto to avoid ENCRYPTION_KEY requirement in dev
vi.mock('../services/crypto.js', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => (v?.startsWith('enc:') ? v.slice(4) : v),
  isLegacyPlaintext: (v: string) => typeof v === 'string' && v.length > 0 && !v.startsWith('enc:'),
}));

describe('print queue multi-tenant ownership (SQL verification)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('markPrintJobPrinted includes user_id in WHERE clause', async () => {
    const { markPrintJobPrinted } = await import('../db.js');
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });

    const result = await markPrintJobPrinted(42, 100);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $2');
    expect(sql).toContain('"id" = $1');
    expect(params).toEqual([100, 42]);
    expect(result).toBe(true);
  });

  it('markPrintJobFailed includes user_id in WHERE clause', async () => {
    const { markPrintJobFailed } = await import('../db.js');
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });

    await markPrintJobFailed(42, 100, 'printer error');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $2');
    expect(sql).toContain('"id" = $1');
    expect(params).toEqual([100, 42, 'printer error']);
  });

  it('getPendingPrintJobs filters by user_id', async () => {
    const { getPendingPrintJobs } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [] });

    await getPendingPrintJobs(42, 10);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $1');
    expect(params).toEqual([42, 10]);
  });

  it('claimPrintJobs uses FOR UPDATE SKIP LOCKED and filters by user_id', async () => {
    const { claimPrintJobs } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [] });

    await claimPrintJobs(42, 'agent-1', 5);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain("'processing'");
    expect(params).toEqual([42, 5, 'agent-1']);
  });

  it('retryFailedJob only retries failed jobs for the tenant', async () => {
    const { retryFailedJob } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    await retryFailedJob(42, 100);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $2');
    expect(sql).toContain("'failed'");
    expect(params).toEqual([100, 42]);
  });

  it('getPrintQueueStats filters all counts by user_id', async () => {
    const { getPrintQueueStats } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [{ pending: 0, processing: 0, printed: 0, failed: 0 }] });

    await getPrintQueueStats(42);

    const [sql, params] = mockQuery.mock.calls[0];
    // All subqueries should filter by user_id = $1
    const matches = sql.match(/"user_id" = \$1/g);
    expect(matches?.length).toBeGreaterThanOrEqual(4);
    expect(params).toEqual([42]);
  });

  it('addPrintQueueJob uses ON CONFLICT DO NOTHING (deduplication)', async () => {
    const { addPrintQueueJob } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    await addPrintQueueJob(42, 999, 'ZPL_CONTENT');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    expect(params).toEqual([42, 999, 'ZPL_CONTENT']);
  });

  it('updateAgentHeartbeat filters by user_id', async () => {
    const { updateAgentHeartbeat } = await import('../db.js');
    mockQuery.mockResolvedValue({ rows: [] });

    await updateAgentHeartbeat('agent-1', 42);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"user_id" = $1');
    expect(params).toEqual([42, 'agent-1', 'agent-1']);
  });
});
