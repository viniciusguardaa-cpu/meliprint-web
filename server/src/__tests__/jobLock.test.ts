import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query, release, connect } = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect };
});
vi.mock('../db.js', () => ({ default: { connect } }));

import { withJobLock } from '../jobs/withJobLock.js';

describe('scheduled job advisory lock', () => {
  beforeEach(() => { query.mockReset(); release.mockReset(); connect.mockClear(); });

  it('runs with a held connection and unlocks afterwards', async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [] });
    const work = vi.fn(async () => {});
    await withJobLock(491001, work);
    expect(work).toHaveBeenCalledOnce();
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT pg_try_advisory_lock($1) AS locked', [491001]);
    expect(query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [491001]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('skips a concurrent tick without unlocking a lock owned elsewhere', async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    const work = vi.fn(async () => {});
    await withJobLock(491001, work);
    expect(work).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the lock and connection after a failed run', async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [] });
    await expect(withJobLock(491002, async () => { throw new Error('job failed'); })).rejects.toThrow('job failed');
    expect(query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [491002]);
    expect(release).toHaveBeenCalledOnce();
  });
});
