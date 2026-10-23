import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({ default: { query: vi.fn() } }));

import pool from '../db.js';
import {
  normalizeRefCode, normalizeUsername, estimateCommission, cyclesSince, parseTerms, summarize,
  attributePartnerSignup, recordPartnerClick, getPartnerDashboard, generateAccessKey, hashAccessKey,
  generatePassword, validPassword, createPartner, setPartnerPassword, deletePartner, changePartnerPassword, findPartnerByCredentials,
} from '../services/partners.js';
import { hashPassword } from '../services/password.js';

const query = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('normalizeRefCode', () => {
  it('accepts simple codes and lowercases', () => {
    expect(normalizeRefCode('EcommerceFree')).toBe('ecommercefree');
    expect(normalizeRefCode('a-b_9')).toBe('a-b_9');
  });
  it('rejects junk', () => {
    for (const bad of ['', 'ab', '-abc', 'a b c', 'x'.repeat(41), "a';drop", 5, null, undefined]) {
      expect(normalizeRefCode(bad as any)).toBeNull();
    }
  });
});

describe('access keys', () => {
  it('are random and stored only as a sha256 hash', () => {
    const a = generateAccessKey(); const b = generateAccessKey();
    expect(a).not.toBe(b);
    expect(a.startsWith('lgp_')).toBe(true);
    expect(hashAccessKey(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessKey(a)).not.toContain(a);
  });
});

describe('parseTerms', () => {
  it('validates ranges and keeps undefined vs null', () => {
    expect(parseTerms({})).toEqual({});
    expect(parseTerms({ commission_pct: '20', commission_months: 12 })).toEqual({ pct: 20, months: 12 });
    expect(parseTerms({ commission_pct: null, commission_months: '' })).toEqual({ pct: null, months: null });
    expect(parseTerms({ commission_pct: 101 }).error).toBeTruthy();
    expect(parseTerms({ commission_pct: -1 }).error).toBeTruthy();
    expect(parseTerms({ commission_months: 0 }).error).toBeTruthy();
    expect(parseTerms({ commission_months: 1.5 }).error).toBeTruthy();
  });
});

describe('commission estimate', () => {
  const now = new Date('2026-12-20T12:00:00');
  it('counts the first charge as cycle 1', () => {
    expect(cyclesSince(new Date('2026-12-10T00:00:00'), now)).toBe(1);
    expect(cyclesSince(new Date('2026-11-15T00:00:00'), now)).toBe(2);
    expect(cyclesSince(new Date('2026-10-20T00:00:00'), now)).toBe(3);
  });
  it('is null when no rate is set', () => {
    const r = [{ status: 'paid' as const, first_paid_at: '2026-11-01', amount: 19.9 }];
    expect(estimateCommission(r, { commission_pct: null, commission_months: 12 }, now)).toEqual({ monthly: null, accrued: null });
  });
  it('applies pct to gross amount and caps at the configured duration', () => {
    const r = [{ status: 'paid' as const, first_paid_at: '2026-10-20T00:00:00', amount: 100 }]; // 3 cycles
    expect(estimateCommission(r, { commission_pct: 20, commission_months: 12 }, now)).toEqual({ monthly: 20, accrued: 60 });
    expect(estimateCommission(r, { commission_pct: 20, commission_months: 2 }, now)).toEqual({ monthly: 0, accrued: 40 });
  });
  it('has no cap when the duration is undecided', () => {
    const r = [{ status: 'paid' as const, first_paid_at: '2026-10-20T00:00:00', amount: 100 }];
    expect(estimateCommission(r, { commission_pct: 20, commission_months: null }, now)).toEqual({ monthly: 20, accrued: 60 });
  });
  it('ignores trials, cancelled and rows without an amount', () => {
    const r = [
      { status: 'trial' as const, first_paid_at: null, amount: null },
      { status: 'cancelled' as const, first_paid_at: '2026-10-01', amount: 50 },
      { status: 'paid' as const, first_paid_at: '2026-10-01', amount: null },
    ];
    expect(estimateCommission(r, { commission_pct: 20, commission_months: 12 }, now)).toEqual({ monthly: 0, accrued: 0 });
  });
  it('summarizes counts per status', () => {
    const rows = [
      { status: 'paid' as const, first_paid_at: '2026-12-01', amount: 19.9 },
      { status: 'trial' as const, first_paid_at: null, amount: null },
      { status: 'none' as const, first_paid_at: null, amount: null },
    ];
    const s = summarize(rows, { commission_pct: 20, commission_months: null }, 9, now);
    expect([s.visitors, s.signups, s.trials, s.paid]).toEqual([9, 3, 1, 1]);
  });
});

describe('attribution', () => {
  beforeEach(() => query.mockReset());
  it('attributes by visitor key within the window, one partner per account', async () => {
    query.mockResolvedValue({ rows: [] });
    await attributePartnerSignup('v1', 7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"partner_clicks"');
    expect(sql).toContain('ON CONFLICT ("user_id") DO NOTHING');
    expect(sql).toContain('"is_active" = true');
    expect(params[0]).toBe('v1'); expect(params[1]).toBe(7);
  });
  it('no-ops without a visitor key and never throws', async () => {
    await attributePartnerSignup('', 7);
    expect(query).not.toHaveBeenCalled();
    query.mockRejectedValueOnce(new Error('db'));
    await expect(attributePartnerSignup('v', 1)).resolves.toBeUndefined();
  });
  it('records clicks only for active partners', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    expect(await recordPartnerClick('v', 'abc')).toBe(true);
    expect(query.mock.calls[0][0]).toContain('"is_active" = true');
    query.mockResolvedValueOnce({ rows: [] });
    expect(await recordPartnerClick('v', 'nope')).toBe(false);
  });
});

describe('partner dashboard privacy', () => {
  beforeEach(() => query.mockReset());
  it('never selects personal data and returns anonymous labels', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'P', ref_code: 'p', is_active: true, commission_pct: '20', commission_months: null }] })
      .mockResolvedValueOnce({ rows: [{ visitors: '4' }] })
      .mockResolvedValueOnce({ rows: [
        { partner_id: 1, signed_up_at: '2026-10-01', first_paid_at: null, status: 'trial', amount: null },
        { partner_id: 1, signed_up_at: '2026-10-02', first_paid_at: '2026-10-05', status: 'paid', amount: '19.90' },
      ] });
    const d = await getPartnerDashboard(1);
    const refSql: string = query.mock.calls[2][0];
    expect(refSql).not.toMatch(/u\."email"\s*(,|AS|FROM)/);
    expect(refSql).not.toContain('"nickname"');
    expect(query.mock.calls[2][1]).toEqual([1]);
    expect(d!.referrals.map((r) => r.label)).toEqual(['Cliente #2', 'Cliente #1']);
    expect(JSON.stringify(d)).not.toMatch(/email|nickname|user_id/);
    expect(d!.summary).toMatchObject({ visitors: 4, signups: 2, trials: 1, paid: 1 });
  });
});

describe('usernames and passwords', () => {
  beforeEach(() => query.mockReset());

  it('normalizes usernames like ref codes and rejects junk', () => {
    expect(normalizeUsername('EcommerceFree')).toBe('ecommercefree');
    expect(normalizeUsername(' loja.exemplo_1 ')).toBe('loja.exemplo_1');
    for (const bad of ['', 'ab', '.abc', 'a b', 'x'.repeat(41), 5, null, undefined]) {
      expect(normalizeUsername(bad as any)).toBeNull();
    }
  });

  it('generates url-safe passwords and validates the minimum length', () => {
    const a = generatePassword(); const b = generatePassword();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(validPassword(a)).toBe(true);
    expect(validPassword('curta')).toBe(false);
    expect(validPassword('')).toBe(false);
    expect(validPassword(null)).toBe(false);
  });

  it('createPartner stores only a scrypt hash and returns a generated password', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'P', ref_code: 'p' }] });
    const { accessKey, generatedPassword, username } = await createPartner({ name: 'P', ref_code: 'p' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"password_hash"');
    expect(params[6]).toBe('p'); // username defaults to the ref code
    expect(params[7]).toMatch(/^scrypt\$/);
    expect(params[7]).not.toBe(generatedPassword);
    expect(generatedPassword).toBeTruthy();
    expect(accessKey.startsWith('lgp_')).toBe(true);
    expect(username).toBe('p');
  });

  it('createPartner never returns an admin-chosen password back', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const { generatedPassword } = await createPartner({ name: 'P', ref_code: 'p', username: 'loja', password: 'senha-do-parceiro' });
    const [, params] = query.mock.calls[0];
    expect(params[6]).toBe('loja');
    expect(params[7]).not.toContain('senha-do-parceiro');
    expect(generatedPassword).toBeNull();
  });

  it('findPartnerByCredentials accepts the right password and rejects the wrong one', async () => {
    const stored = hashPassword('senha-certa-123');
    query.mockResolvedValue({ rows: [{ id: 3, name: 'P', password_hash: stored }] });
    expect(await findPartnerByCredentials('Loja', 'senha-certa-123')).toEqual({ id: 3, name: 'P' });
    expect(await findPartnerByCredentials('loja', 'errada-errada')).toBeNull();
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe('loja'); // case-insensitive lookup
  });

  it('findPartnerByCredentials returns null for unknown users and bad input without leaking', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await findPartnerByCredentials('ninguem', 'qualquer-coisa')).toBeNull();
    expect(await findPartnerByCredentials('!!', 'qualquer-coisa')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1); // invalid usernames never hit the DB
  });

  it('setPartnerPassword stores only the hash and returns the plaintext once', async () => {
    query.mockResolvedValueOnce({ rows: [{ username: 'loja' }] });
    const reset = await setPartnerPassword(5);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('UPDATE "partners" SET "password_hash"');
    expect(params[1]).toMatch(/^scrypt\$/);
    expect(params[1]).not.toBe(reset!.password);
    expect(reset!.password).toBeTruthy();
    expect(reset!.username).toBe('loja');
  });

  it('setPartnerPassword backfills the username from the ref code for legacy partners', async () => {
    query.mockResolvedValueOnce({ rows: [{ username: 'ecommercefree' }] });
    await setPartnerPassword(9);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('"username" = COALESCE("username", "ref_code")');
  });

  it('deletePartner removes the row (clicks and referrals cascade) and reports misses', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    expect(await deletePartner(4)).toBe(true);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM "partners"');
    expect(params[0]).toBe(4);
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    expect(await deletePartner(99)).toBe(false);
  });

  it('changePartnerPassword requires the current password', async () => {
    const stored = hashPassword('atual-12345');
    query.mockResolvedValueOnce({ rows: [{ password_hash: stored }] }).mockResolvedValueOnce({ rows: [] });
    const ok = await changePartnerPassword(7, 'atual-12345', 'nova-senha-987');
    expect(ok.ok).toBe(true);
    expect(query.mock.calls[1][1][1]).toMatch(/^scrypt\$/);
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ password_hash: stored }] });
    const bad = await changePartnerPassword(7, 'errada', 'nova-senha-987');
    expect(bad.ok).toBe(false);
    expect(query).toHaveBeenCalledTimes(1); // no UPDATE on failure
  });
});
