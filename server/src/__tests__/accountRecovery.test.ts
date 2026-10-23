import 'express-async-errors';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import { listen, close } from './helpers/http.js';
import { hashPassword } from '../services/password.js';

const db = vi.hoisted(() => ({
  createUser: vi.fn(), getUserById: vi.fn(), getUserByEmail: vi.fn(),
  setUserPassword: vi.fn(), claimUnverifiedAccount: vi.fn(),
  getUserSessionState: vi.fn(), getMarketplaceAccountByExternal: vi.fn(),
  upsertMarketplaceAccount: vi.fn(), setUserMlId: vi.fn(),
  getMarketplaceAccountsForUser: vi.fn(), createAuthToken: vi.fn(), consumeAuthToken: vi.fn(),
}));
vi.mock('../db.js', () => db);
vi.mock('../services/analytics.js', () => ({ trackEvent: vi.fn(), linkVisitorToUser: vi.fn() }));
vi.mock('../services/mailer.js', () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock('../middleware/rateLimiter.js', () => ({ authLimiter: (_req: any, _res: any, next: any) => next() }));
const provider = vi.hoisted(() => ({
  oauthState: 'required', isConfigured: () => true,
  getAuthUrl: (_uri: string, state: string) => `https://auth.example/?state=${state}`,
  exchangeCode: vi.fn(),
}));
vi.mock('../providers/index.js', () => ({ getProvider: (id: string) => ({ ...provider, id }), listProviders: () => [] }));
import authRoutes from '../routes/auth.js';
import { sessionGuard } from '../middleware/sessionGuard.js';
import { rejectCrossSiteRequests } from '../middleware/csrf.js';
import { errorHandler } from '../middleware/errors.js';

let http: Awaited<ReturnType<typeof listen>>;
let user: any;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use(rejectCrossSiteRequests, sessionGuard);
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  http = await listen(app);
});
afterAll(async () => { await close(http.server); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
  user = { id: 5, email: 'owner@example.com', nickname: 'Owner', email_verified: false,
    password_hash: hashPassword('previous-password'), sessions_revoked_at: null };
  db.getUserByEmail.mockImplementation(async () => user);
  db.getUserById.mockImplementation(async () => user);
  db.getUserSessionState.mockImplementation(async () => user);
  db.getMarketplaceAccountsForUser.mockResolvedValue([]);
  db.createAuthToken.mockResolvedValue({ token: 'test' });
  db.getMarketplaceAccountByExternal.mockResolvedValue(null);
  db.setUserMlId.mockResolvedValue(undefined);
  db.claimUnverifiedAccount.mockImplementation(async (_id, at) => {
    user.password_hash = null; user.email_verified = true; user.sessions_revoked_at = at;
  });
  db.setUserPassword.mockImplementation(async (_id, hash, at) => {
    user.password_hash = hash; user.email_verified = true; user.sessions_revoked_at = at;
  });
});
afterAll(() => vi.unstubAllEnvs());

async function post(path: string, body: any, cookie?: string) {
  return fetch(`${http.base}/api/auth${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body), redirect: 'manual' });
}
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];

async function oauth(identity: any, id = 'mercadolivre') {
  provider.exchangeCode.mockResolvedValue({ identity, tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 } });
  const start = await fetch(`${http.base}/api/auth/oauth/${id}/start`);
  const { authUrl } = await start.json();
  const state = new URL(authUrl).searchParams.get('state');
  return fetch(`${http.base}/api/auth/oauth/${id}/callback?code=c&state=${state}`, {
    headers: { Cookie: cookieOf(start) }, redirect: 'manual' });
}

it('connects Mercado Livre, removes a pre-registrant password and rejects their existing session', async () => {
  const attacker = await post('/login', { email: user.email, password: 'previous-password' });
  expect(attacker.status).toBe(200);
  const owner = await oauth({ externalUserId: 'ML1', email: user.email, emailVerified: true });
  expect(owner.status).toBe(302);
  expect(db.claimUnverifiedAccount).toHaveBeenCalledWith(5, expect.any(Date));
  expect(db.upsertMarketplaceAccount).toHaveBeenCalledWith(5, 'mercadolivre', 'ML1', expect.anything());
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(attacker) } })).status).toBe(401);
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(owner) } })).status).toBe(200);
  expect((await post('/login', { email: user.email, password: 'previous-password' })).status).toBe(401);
});

it('preserves the password and sessions of an already verified owner', async () => {
  user.email_verified = true;
  const login = await post('/login', { email: user.email, password: 'previous-password' });
  expect((await oauth({ externalUserId: 'ML1', email: user.email, emailVerified: true })).status).toBe(302);
  expect(db.claimUnverifiedAccount).not.toHaveBeenCalled();
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(login) } })).status).toBe(200);
});

it('never links accounts using an unverified provider email', async () => {
  db.createUser.mockResolvedValue({ id: 5 });
  await oauth({ externalUserId: 'BL1', email: user.email }, 'bling');
  expect(db.getUserByEmail).not.toHaveBeenCalled();
  expect(db.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'bling_BL1@noemail.labelgo', emailVerified: false }));
});

it('also protects legacy stores already connected to an unverified matching email', async () => {
  db.getMarketplaceAccountByExternal.mockResolvedValue({ user_id: 5 });
  const response = await oauth({ externalUserId: 'ML1', email: user.email, emailVerified: true });
  expect(response.status).toBe(302);
  expect(db.claimUnverifiedAccount).toHaveBeenCalledWith(5, expect.any(Date));
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(response) } })).status).toBe(200);
});

it('resets the password, revokes previous sessions and preserves the recovery session', async () => {
  const old = await post('/login', { email: user.email, password: 'previous-password' });
  db.consumeAuthToken.mockResolvedValue(5);
  const recovered = await post('/reset-password', { token: 'valid', password: 'new-password' });
  expect(recovered.status).toBe(200);
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(old) } })).status).toBe(401);
  expect((await fetch(`${http.base}/api/auth/me`, { headers: { Cookie: cookieOf(recovered) } })).status).toBe(200);
  expect((await post('/login', { email: user.email, password: 'new-password' })).status).toBe(200);
});

it('rejects blocked accounts and does not claim them through OAuth', async () => {
  user.blocked_at = new Date();
  expect((await post('/login', { email: user.email, password: 'previous-password' })).status).toBe(403);
  const response = await oauth({ externalUserId: 'ML1', email: user.email, emailVerified: true });
  expect(response.headers.get('location')).toContain('error=account_blocked');
  expect(db.claimUnverifiedAccount).not.toHaveBeenCalled();
});

it('rejects forged OAuth state without exchanging credentials', async () => {
  const response = await fetch(`${http.base}/api/auth/oauth/mercadolivre/callback?code=c&state=forged`);
  expect(response.status).toBe(400);
  expect(provider.exchangeCode).not.toHaveBeenCalled();
});
