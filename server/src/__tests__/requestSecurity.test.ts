import 'express-async-errors';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import { rejectCrossSiteRequests } from '../middleware/csrf.js';
import { errorHandler } from '../middleware/errors.js';
import { listen, close } from './helpers/http.js';

let http: Awaited<ReturnType<typeof listen>>;
beforeAll(async () => {
  vi.stubEnv('FRONTEND_URL', 'https://labelgo.com.br');
  const app = express();
  app.use(rejectCrossSiteRequests, express.json());
  app.post('/mutation', (_req, res) => res.json({ ok: true }));
  app.get('/oauth/callback', (_req, res) => res.json({ ok: true }));
  app.get('/broken', async () => { throw new Error('private database error'); });
  app.use(errorHandler);
  http = await listen(app);
});
afterAll(async () => { await close(http.server); vi.unstubAllEnvs(); });

it.each<Record<string, string>>([
  { Origin: 'https://evil.example' },
  { Origin: 'null' },
  { 'Sec-Fetch-Site': 'cross-site' },
  { 'Sec-Fetch-Site': 'same-site' },
  { Referer: 'https://evil.example/form' },
  { Cookie: 'connect.sid=existing' },
])('rejects foreign or unverifiable browser mutations: %o', async (headers) => {
  const response = await fetch(`${http.base}/mutation`, { method: 'POST', headers });
  expect(response.status).toBe(403);
});

it.each<Record<string, string>>([
  { Origin: 'https://labelgo.com.br', Cookie: 'connect.sid=existing' },
  { 'Sec-Fetch-Site': 'same-origin', Cookie: 'connect.sid=existing' },
  { Referer: 'https://labelgo.com.br/dashboard', Cookie: 'connect.sid=existing' },
  { Authorization: 'Bearer agent-token' },
  { 'X-Signature': 'webhook-signature' },
])('preserves frontend, local-agent and server-webhook calls: %o', async (headers) => {
  const response = await fetch(`${http.base}/mutation`, { method: 'POST', headers });
  expect(response.status).toBe(200);
});

it('preserves cross-site OAuth GET callbacks', async () => {
  expect((await fetch(`${http.base}/oauth/callback`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(200);
});

it('forwards async route failures and keeps the process serving requests', async () => {
  const response = await fetch(`${http.base}/broken`);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Internal server error' });
  expect((await fetch(`${http.base}/oauth/callback`)).status).toBe(200);
});

it('returns sanitized errors for malformed JSON', async () => {
  const response = await fetch(`${http.base}/mutation`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://labelgo.com.br' }, body: '{"password":"secret"' });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_json' });
});
