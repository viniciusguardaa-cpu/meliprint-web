import crypto from 'crypto';
import pool from '../db.js';
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from './password.js';

/** A partner click only counts for the signup if it happened in this window. */
export const ATTRIBUTION_WINDOW_DAYS = 30;

const REF_CODE_RE = /^[a-z0-9][a-z0-9_-]{2,39}$/;

export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  return REF_CODE_RE.test(code) ? code : null;
}

export function hashAccessKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateAccessKey(): string {
  return `lgp_${crypto.randomBytes(24).toString('hex')}`;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

/** Initial/reset password: 72 bits of entropy, URL-safe, shown once. */
export function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function validPassword(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= PASSWORD_MIN_LENGTH && raw.length <= 200;
}

// Computed once so a login with an unknown username costs the same scrypt as a
// real one (no user enumeration via timing).
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

export function partnerLink(code: string): string {
  const base = (process.env.FRONTEND_URL || 'https://labelgo.com.br').replace(/\/+$/, '');
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/** Record that an anonymous visitor arrived through a partner link. */
export async function recordPartnerClick(visitorKey: string, code: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO "partner_clicks" ("partner_id", "visitor_key")
       SELECT "id", $1 FROM "partners" WHERE "ref_code" = $2 AND "is_active" = true
       RETURNING "id"`,
      [visitorKey, code]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[partners] Failed to record click:', err);
    return false;
  }
}

/**
 * Attribute a brand-new account to the partner whose link the visitor used most
 * recently (within the window). One partner per account; never reassigned.
 */
export async function attributePartnerSignup(visitorKey: string, userId: number): Promise<void> {
  if (!visitorKey) return;
  try {
    await pool.query(
      `INSERT INTO "partner_referrals" ("partner_id", "user_id")
       SELECT c."partner_id", $2
       FROM "partner_clicks" c
       JOIN "partners" p ON p."id" = c."partner_id" AND p."is_active" = true
       WHERE c."visitor_key" = $1
         AND c."created_at" >= NOW() - ($3::int * INTERVAL '1 day')
       ORDER BY c."created_at" DESC
       LIMIT 1
       ON CONFLICT ("user_id") DO NOTHING`,
      [visitorKey, userId, ATTRIBUTION_WINDOW_DAYS]
    );
  } catch (err) {
    console.error('[partners] Failed to attribute signup:', err);
  }
}

/** Stamp the first paid activation of a referred account (first one wins). */
export async function markPartnerReferralPaid(userId: number): Promise<void> {
  await pool.query(
    `UPDATE "partner_referrals" SET "first_paid_at" = CURRENT_TIMESTAMP
     WHERE "user_id" = $1 AND "first_paid_at" IS NULL`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type ReferralStatus = 'paid' | 'trial' | 'cancelled' | 'none';

export interface ReferralRow {
  partner_id: number;
  signed_up_at: Date | string;
  first_paid_at: Date | string | null;
  status: ReferralStatus;
  /** Contracted monthly amount of the active paid subscription (BRL). */
  amount: number | null;
}

export interface CommissionTerms {
  commission_pct: number | null;
  commission_months: number | null;
}

/** Whole billing cycles elapsed since `from`, counting the first charge as cycle 1. */
export function cyclesSince(from: Date, now: Date): number {
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(1, months + 1);
}

/**
 * Commission ESTIMATE from contracted amounts: pct% of each paid referral's
 * monthly amount, for at most `commission_months` cycles since first payment.
 * Returns nulls when no rate is set; a missing duration means no cap. This is not a record
 * of money actually received or paid.
 */
export function estimateCommission(
  referrals: Array<Pick<ReferralRow, 'status' | 'first_paid_at' | 'amount'>>,
  terms: CommissionTerms,
  now: Date = new Date()
): { monthly: number | null; accrued: number | null } {
  const pct = terms.commission_pct;
  const months = terms.commission_months;
  if (pct === null || pct === undefined) return { monthly: null, accrued: null };
  // Duration undecided (null): no cap, so the figure is an upper bound.
  const cap = months === null || months === undefined ? Infinity : months;
  let monthly = 0;
  let accrued = 0;
  for (const r of referrals) {
    if (r.status !== 'paid' || !r.amount || !r.first_paid_at) continue;
    const cycles = cyclesSince(new Date(r.first_paid_at), now);
    const perCycle = (r.amount * pct) / 100;
    if (cycles <= cap) monthly += perCycle;
    accrued += perCycle * Math.min(cycles, cap);
  }
  return { monthly: round2(monthly), accrued: round2(accrued) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarize(
  referrals: Array<Pick<ReferralRow, 'status' | 'first_paid_at' | 'amount'>>,
  terms: CommissionTerms,
  visitors: number,
  now: Date = new Date()
) {
  return {
    visitors,
    signups: referrals.length,
    trials: referrals.filter((r) => r.status === 'trial').length,
    paid: referrals.filter((r) => r.status === 'paid').length,
    cancelled: referrals.filter((r) => r.status === 'cancelled').length,
    commission: estimateCommission(referrals, terms, now),
  };
}

/** One row per referred account, status derived from its subscriptions. No personal data selected. */
const REFERRAL_ROWS_SQL = `
  SELECT r."partner_id", r."signed_up_at", COALESCE(r."first_paid_at", paid."created_at") AS first_paid_at,
    CASE
      WHEN paid."user_id" IS NOT NULL THEN 'paid'
      WHEN s."has_trial" THEN 'trial'
      WHEN s."has_cancelled" THEN 'cancelled'
      ELSE 'none'
    END AS status,
    paid."amount" AS amount
  FROM "partner_referrals" r
  JOIN "users" u ON u."id" = r."user_id"
  LEFT JOIN LATERAL (
    SELECT sub."user_id", sub."contracted_amount" AS amount, sub."created_at"
    FROM "subscriptions" sub
    WHERE sub."user_id" = r."user_id" AND sub."status" IN ('authorized', 'active')
      AND NOT EXISTS (SELECT 1 FROM "free_access" f WHERE LOWER(f."email") = LOWER(u."email"))
    ORDER BY sub."created_at" DESC LIMIT 1
  ) paid ON true
  LEFT JOIN LATERAL (
    SELECT BOOL_OR(sub."status" = 'trialing') AS has_trial,
           BOOL_OR(sub."status" = 'cancelled') AS has_cancelled
    FROM "subscriptions" sub WHERE sub."user_id" = r."user_id"
  ) s ON true
`;

function toRow(r: any): ReferralRow {
  return {
    partner_id: Number(r.partner_id),
    signed_up_at: r.signed_up_at,
    first_paid_at: r.first_paid_at,
    status: r.status,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
  };
}

function termsOf(p: any): CommissionTerms {
  return {
    commission_pct: p.commission_pct === null || p.commission_pct === undefined ? null : Number(p.commission_pct),
    commission_months: p.commission_months === null || p.commission_months === undefined ? null : Number(p.commission_months),
  };
}

/** Admin view: every partner with its numbers. */
export async function listPartnersWithMetrics() {
  const [partners, clicks, refs] = await Promise.all([
    pool.query(`SELECT * FROM "partners" ORDER BY "created_at" DESC`),
    pool.query(`SELECT "partner_id", COUNT(DISTINCT "visitor_key") AS visitors FROM "partner_clicks" GROUP BY 1`),
    pool.query(REFERRAL_ROWS_SQL),
  ]);
  const visitorsBy = new Map<number, number>(clicks.rows.map((c: any) => [Number(c.partner_id), Number(c.visitors)]));
  const refRows = refs.rows.map(toRow);
  return partners.rows.map((p: any) => {
    const mine = refRows.filter((r) => r.partner_id === p.id);
    return {
      id: p.id,
      name: p.name,
      contact_email: p.contact_email,
      ref_code: p.ref_code,
      username: p.username ?? null,
      link: partnerLink(p.ref_code),
      is_active: p.is_active,
      created_at: p.created_at,
      ...termsOf(p),
      ...summarize(mine, termsOf(p), visitorsBy.get(p.id) ?? 0),
    };
  });
}

/**
 * Partner view: own numbers plus an ANONYMOUS referral list. No e-mail, name,
 * user id or marketplace data is selected: only signup date, a per-partner
 * sequence number and the account's state.
 */
export async function getPartnerDashboard(partnerId: number) {
  const [partnerRes, clicks, refs] = await Promise.all([
    pool.query(`SELECT * FROM "partners" WHERE "id" = $1`, [partnerId]),
    pool.query(`SELECT COUNT(DISTINCT "visitor_key") AS visitors FROM "partner_clicks" WHERE "partner_id" = $1`, [partnerId]),
    pool.query(`${REFERRAL_ROWS_SQL} WHERE r."partner_id" = $1 ORDER BY r."signed_up_at" ASC`, [partnerId]),
  ]);
  const p = partnerRes.rows[0];
  if (!p) return null;
  const rows = refs.rows.map(toRow);
  const terms = termsOf(p);
  return {
    partner: { name: p.name, ref_code: p.ref_code, link: partnerLink(p.ref_code), is_active: p.is_active, ...terms },
    summary: summarize(rows, terms, Number(clicks.rows[0]?.visitors ?? 0)),
    referrals: rows.map((r, i) => ({
      label: `Cliente #${i + 1}`,
      signed_up_at: r.signed_up_at,
      status: r.status,
      first_paid_at: r.first_paid_at,
    })).reverse(),
  };
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export interface PartnerInput {
  name?: unknown;
  contact_email?: unknown;
  ref_code?: unknown;
  commission_pct?: unknown;
  commission_months?: unknown;
  is_active?: unknown;
}

/** Validate commission terms; `undefined` means "not provided", `null` means "clear". */
export function parseTerms(input: PartnerInput): { error?: string; pct?: number | null; months?: number | null } {
  const out: { pct?: number | null; months?: number | null } = {};
  if (input.commission_pct !== undefined) {
    if (input.commission_pct === null || input.commission_pct === '') out.pct = null;
    else {
      const n = Number(input.commission_pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'commission_pct deve estar entre 0 e 100' };
      out.pct = n;
    }
  }
  if (input.commission_months !== undefined) {
    if (input.commission_months === null || input.commission_months === '') out.months = null;
    else {
      const n = Number(input.commission_months);
      if (!Number.isInteger(n) || n < 1 || n > 120) return { error: 'commission_months deve ser um inteiro de 1 a 120' };
      out.months = n;
    }
  }
  return out;
}

export const DEFAULT_COMMISSION_PCT = 20;

export async function createPartner(input: { name: string; contact_email?: string | null; ref_code: string; pct?: number | null; months?: number | null; username?: string | null; password?: string | null }) {
  const accessKey = generateAccessKey();
  const username = input.username ?? input.ref_code;
  const initialPassword = input.password || generatePassword();
  const result = await pool.query(
    `INSERT INTO "partners" ("name", "contact_email", "ref_code", "commission_pct", "commission_months", "access_key_hash", "username", "password_hash")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [input.name, input.contact_email ?? null, input.ref_code, input.pct === undefined ? DEFAULT_COMMISSION_PCT : input.pct, input.months ?? null, hashAccessKey(accessKey), username, hashPassword(initialPassword)]
  );
  // The plaintext password is returned only when we generated it; an
  // admin-chosen one is already known to the admin.
  return { partner: result.rows[0], accessKey, username, generatedPassword: input.password ? null : initialPassword };
}

export async function updatePartner(id: number, fields: { name?: string; contact_email?: string | null; pct?: number | null; months?: number | null; is_active?: boolean; username?: string | null }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, v: unknown) => { params.push(v); sets.push(`"${col}" = $${params.length}`); };
  if (fields.name !== undefined) add('name', fields.name);
  if (fields.contact_email !== undefined) add('contact_email', fields.contact_email);
  if (fields.pct !== undefined) add('commission_pct', fields.pct);
  if (fields.months !== undefined) add('commission_months', fields.months);
  if (fields.is_active !== undefined) add('is_active', fields.is_active);
  if (fields.username !== undefined) {
    add('username', fields.username);
    if (fields.username === null) add('password_hash', null); // clearing the user disables password login
  }
  if (!sets.length) return null;
  params.push(id);
  const result = await pool.query(`UPDATE "partners" SET ${sets.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
  return result.rows[0] ?? null;
}

export async function rotatePartnerKey(id: number): Promise<string | null> {
  const accessKey = generateAccessKey();
  const result = await pool.query(`UPDATE "partners" SET "access_key_hash" = $2 WHERE "id" = $1 RETURNING "id"`, [id, hashAccessKey(accessKey)]);
  return result.rows[0] ? accessKey : null;
}

/** Admin reset: stores a new hash and returns the plaintext once. Legacy partners
 * without a username get their ref_code as the username, so the reset actually
 * enables password login for them (ref codes satisfy the username rules). */
export async function setPartnerPassword(id: number, password?: string): Promise<{ password: string; username: string } | null> {
  const plain = password || generatePassword();
  const result = await pool.query(
    `UPDATE "partners" SET "password_hash" = $2, "username" = COALESCE("username", "ref_code") WHERE "id" = $1 RETURNING "username"`,
    [id, hashPassword(plain)]
  );
  return result.rows[0] ? { password: plain, username: result.rows[0].username } : null;
}

/** Admin delete: removes the partner for good; clicks and referrals cascade
 * (ON DELETE CASCADE), freeing the ref_code and username for reuse. */
export async function deletePartner(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM "partners" WHERE "id" = $1 RETURNING "id"`, [id]);
  return result.rows.length > 0;
}

/** Partner self-service: requires the current password. */
export async function changePartnerPassword(id: number, current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const result = await pool.query(`SELECT "password_hash" FROM "partners" WHERE "id" = $1 AND "is_active" = true`, [id]);
  const row = result.rows[0];
  if (!row || !row.password_hash || !verifyPassword(current, row.password_hash)) {
    return { ok: false, error: 'Senha atual incorreta' };
  }
  await pool.query(`UPDATE "partners" SET "password_hash" = $2 WHERE "id" = $1`, [id, hashPassword(next)]);
  return { ok: true };
}

/** Username + password login. Constant-time-ish: unknown users still pay a scrypt. */
export async function findPartnerByCredentials(username: string, password: string) {
  const u = normalizeUsername(username);
  if (!u || typeof password !== 'string' || password.length > 200) return null;
  const result = await pool.query(
    `SELECT "id", "name", "password_hash" FROM "partners" WHERE LOWER("username") = $1 AND "is_active" = true`,
    [u]
  );
  const row = result.rows[0];
  const ok = verifyPassword(password, row?.password_hash || getDummyHash());
  if (!row || !ok) return null;
  return { id: Number(row.id), name: row.name };
}

export async function findPartnerByAccessKey(key: string) {
  if (!key || key.length > 200) return null;
  const result = await pool.query(
    `SELECT "id", "name" FROM "partners" WHERE "access_key_hash" = $1 AND "is_active" = true`,
    [hashAccessKey(key)]
  );
  return result.rows[0] ?? null;
}
