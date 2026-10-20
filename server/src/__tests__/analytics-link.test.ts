import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  default: { query: vi.fn() }
}));

import pool from '../db.js';
import { linkVisitorToUser } from '../services/analytics.js';

const query = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('linkVisitorToUser', () => {
  beforeEach(() => query.mockReset());

  it('links first/last-touch attribution and pre-signup events that have no user yet', async () => {
    await linkVisitorToUser('visitor-123', 42);
    expect(query).toHaveBeenCalledTimes(2);

    const [utmSql, utmParams] = query.mock.calls[0];
    expect(utmSql).toContain('"utm_attribution"');
    expect(utmSql).toContain('"user_id" IS NULL');
    expect(utmParams).toEqual(['visitor-123', 42]);

    const [eventsSql, eventsParams] = query.mock.calls[1];
    expect(eventsSql).toContain('"analytics_events"');
    expect(eventsSql).toContain('"user_id" IS NULL');
    expect(eventsParams).toEqual(['visitor-123', 42]);
  });

  it('no-ops without a visitor key', async () => {
    await linkVisitorToUser('', 42);
    expect(query).not.toHaveBeenCalled();
  });

  it('never breaks signup when the analytics write fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(linkVisitorToUser('v', 1)).resolves.toBeUndefined();
  });
});
