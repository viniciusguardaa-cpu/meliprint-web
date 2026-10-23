import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const settings = vi.hoisted(() => {
  const schema = `recovery_${process.pid}_${Date.now()}`;
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
  }
  return { schema, testUrl: process.env.TEST_DATABASE_URL };
});
import pool, { claimUnverifiedAccount, setUserPassword, getUserById, getMarketplaceAccountByExternal,
  getAutoPrintConfigByAgentToken, upsertAutoPrintConfig, upsertMarketplaceAccount,
  getMarketplaceAccountsForUser, consumePairingCode, createAuthToken, consumeAuthToken,
  hasProAccess, getAutoPrintEnabledConfigs } from '../db.js';
import { hashPassword, verifyPassword } from '../services/password.js';

describe.skipIf(!settings.testUrl)('account recovery against isolated Postgres', () => {
  let admin: pg.Pool;
  let userId: number;
  let authToken: string;
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: settings.testUrl, options: '-c search_path=public' });
    await admin.query(`CREATE SCHEMA "${settings.schema}"`);
    const migrations = path.resolve(import.meta.dirname, '../../migrations');
    for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${settings.schema}" CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE "users" CASCADE');
    const result = await pool.query(`INSERT INTO "users" ("nickname", "email", "password_hash", "email_verified")
      VALUES ('Owner', 'owner@example.com', $1, false) RETURNING "id"`, [hashPassword('attacker-password')]);
    userId = result.rows[0].id;
    await upsertMarketplaceAccount(userId, 'mercadolivre', 'attacker-store', { accessToken: 'token' });
    await upsertAutoPrintConfig(userId, { enabled: true, agentToken: 'old-agent-token' });
    await pool.query(`INSERT INTO "agent_pairing_codes" ("code", "user_id", "expires_at")
      VALUES ('OLD-CODE', $1, CURRENT_TIMESTAMP + interval '1 hour')`, [userId]);
    await pool.query(`INSERT INTO "print_queue" ("user_id", "shipment_id", "zpl", "status")
      VALUES ($1, 'ORDER1', '^XA^XZ', 'pending')`, [userId]);
    authToken = (await createAuthToken(userId, 'reset_password', 30)).token;
  });

  it('claims an unverified account and removes every old way back in, then connects the real owner', async () => {
    const revokedAt = new Date();
    await claimUnverifiedAccount(userId, revokedAt);
    const user = await getUserById(userId);
    expect(user.email_verified).toBe(true);
    expect(user.password_hash).toBeNull();
    expect(user.sessions_revoked_at.getTime()).toBe(revokedAt.getTime());
    expect(await getMarketplaceAccountByExternal('mercadolivre', 'attacker-store')).toBeNull();
    expect(await getMarketplaceAccountsForUser(userId)).toEqual([]);
    expect(await getAutoPrintConfigByAgentToken('old-agent-token')).toBeNull();
    expect(await consumePairingCode('OLD-CODE')).toBeNull();
    expect(await consumeAuthToken(authToken, 'reset_password')).toBeNull();
    expect((await pool.query('SELECT "status" FROM "print_queue" WHERE "user_id" = $1', [userId])).rows[0].status).toBe('needs_review');
    await upsertMarketplaceAccount(userId, 'mercadolivre', 'owner-store', { accessToken: 'new-token' });
    expect((await getMarketplaceAccountsForUser(userId))[0].external_user_id).toBe('owner-store');
  });

  it('does not erase a verified account if verification races with an OAuth callback', async () => {
    await pool.query('UPDATE "users" SET "email_verified" = true WHERE "id" = $1', [userId]);
    await claimUnverifiedAccount(userId, new Date());
    expect(verifyPassword('attacker-password', (await getUserById(userId)).password_hash)).toBe(true);
    expect(await getMarketplaceAccountsForUser(userId)).toHaveLength(1);
  });

  it('updates the password and revokes sessions, reset links, pairing codes and agent access atomically', async () => {
    await pool.query('UPDATE "users" SET "email_verified" = true WHERE "id" = $1', [userId]);
    const at = new Date();
    await setUserPassword(userId, hashPassword('new-owner-password'), at);
    const user = await getUserById(userId);
    expect(verifyPassword('new-owner-password', user.password_hash)).toBe(true);
    expect(verifyPassword('attacker-password', user.password_hash)).toBe(false);
    expect(user.sessions_revoked_at.getTime()).toBe(at.getTime());
    expect(await consumeAuthToken(authToken, 'reset_password')).toBeNull();
    expect(await getAutoPrintConfigByAgentToken('old-agent-token')).toBeNull();
    expect(await consumePairingCode('OLD-CODE')).toBeNull();
    expect(await getMarketplaceAccountsForUser(userId)).toHaveLength(1);
  });

  it('also removes pre-registrant marketplace logins when recovering an unverified account by email', async () => {
    await setUserPassword(userId, hashPassword('owner-password'));
    expect(await getMarketplaceAccountsForUser(userId)).toEqual([]);
    expect((await getUserById(userId)).email_verified).toBe(true);
  });

  it('grants email-based courtesy access only after the mailbox is verified', async () => {
    await pool.query(`INSERT INTO "free_access" ("email") VALUES ('owner@example.com') ON CONFLICT DO NOTHING`);
    expect(await hasProAccess(userId)).toBe(false);
    expect(await getAutoPrintEnabledConfigs()).toEqual([]);
    await pool.query('UPDATE "users" SET "email_verified" = true WHERE "id" = $1', [userId]);
    expect(await hasProAccess(userId)).toBe(true);
    expect(await getAutoPrintEnabledConfigs()).toHaveLength(1);
  });
});
