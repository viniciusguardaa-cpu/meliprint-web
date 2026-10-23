import 'express-async-errors';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { listen, close } from './helpers/http.js';

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), refresh: vi.fn(), list: vi.fn() }));
vi.mock('../db.js', () => ({ getMarketplaceAccountsForUser: mocks.accounts }));
vi.mock('../middleware/subscription.js', () => ({ requireActiveSubscription: (req: any, _res: any, next: any) => {
  req.session = { userId: 1 }; req.planId = undefined; next();
} }));
vi.mock('../services/accounts.js', () => ({ getFreshAccountContext: mocks.refresh }));
vi.mock('../providers/index.js', () => ({ getProvider: () => ({ listReadyShipments: mocks.list }) }));
import shipmentsRoutes from '../routes/shipments.js';
import { errorHandler } from '../middleware/errors.js';
import { ShipmentListError } from '../providers/types.js';

let http: Awaited<ReturnType<typeof listen>>;
beforeAll(async () => {
  const app = express(); app.use('/shipments', shipmentsRoutes); app.use(errorHandler); http = await listen(app);
});
afterAll(async () => { await close(http.server); });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.accounts.mockResolvedValue([{ id: 1, provider: 'mercadolivre' }, { id: 2, provider: 'shopee', nickname: 'Loja' }]);
  mocks.refresh.mockImplementation(async (account) => account);
  mocks.list.mockImplementation(async (account) => {
    if (account.id === 2) throw new Error('upstream unavailable, private access token');
    return [{ shipmentId: 'ML1', substatus: 'ready_to_print', marketplace: 'mercadolivre' }];
  });
});

it('returns successful accounts and an explicit failure without leaking upstream errors', async () => {
  const response = await fetch(`${http.base}/shipments`);
  const data = await response.json();
  expect(data.ready).toHaveLength(1);
  expect(data.failedAccounts).toEqual([{ accountId: 2, provider: 'shopee', nickname: 'Loja' }]);
  expect(JSON.stringify(data)).not.toContain('private access token');
});
it('reports refresh failures instead of an apparently empty store', async () => {
  mocks.refresh.mockResolvedValue(null);
  const data = await (await fetch(`${http.base}/shipments`)).json();
  expect(data.ready).toEqual([]);
  expect(data.failedAccounts).toHaveLength(2);
});
it('reports thrown refresh errors without dropping successful accounts', async () => {
  mocks.refresh.mockImplementation(async (account) => {
    if (account.id === 2) throw new Error('database unavailable'); return account;
  });
  const data = await (await fetch(`${http.base}/shipments`)).json();
  expect(data.ready).toHaveLength(1);
  expect(data.failedAccounts).toHaveLength(1);
});
it('keeps expired credentials in the reconnect banner', async () => {
  mocks.accounts.mockResolvedValue([{ id: 2, provider: 'shopee', status: 'reauth_required' }]);
  const data = await (await fetch(`${http.base}/shipments`)).json();
  expect(data.needsReauth).toEqual([{ accountId: 2, provider: 'shopee' }]);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('preserves partial account rows with an explicit incomplete-account warning', async () => {
  mocks.accounts.mockResolvedValue([{ id: 1, provider: 'mercadolivre' }]);
  mocks.list.mockRejectedValue(new ShipmentListError('incomplete', [{ shipmentId: 'ML1', marketplace: 'mercadolivre', substatus: 'ready_to_print' } as any]));
  const data = await (await fetch(`${http.base}/shipments`)).json();
  expect(data.ready).toHaveLength(1);
  expect(data.failedAccounts).toEqual([{ accountId: 1, provider: 'mercadolivre' }]);
});
