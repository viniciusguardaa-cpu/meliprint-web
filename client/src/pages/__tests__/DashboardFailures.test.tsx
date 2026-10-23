// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { nickname: 'Demo', accounts: [] }, checkAuth: vi.fn(), connectAccount: vi.fn(), logout: vi.fn() }) }));
vi.mock('../../hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: {} }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps a partial-failure warning until a successful retry and avoids claiming there are no orders', async () => {
  let failed = true;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ providers: [], ready: [], reprint: [], failedAccounts: failed ? [{ accountId: 2, provider: 'shopee', nickname: 'Loja' }] : [] }) })));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toContain('Shopee (Loja)');
  expect(screen.getByText('Consulta de envios incompleta')).toBeTruthy();
  expect(screen.queryByText('Nenhum envio encontrado')).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(await screen.findByText('Nenhum envio encontrado')).toBeTruthy();
});

it('keeps an error visible when the entire request fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    if (String(input).includes('/shipments')) throw new Error('network unavailable');
    return { ok: true, json: async () => ({ providers: [] }) };
  }));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível atualizar os envios');
  expect(screen.queryByText('Nenhum envio encontrado')).toBeNull();
});
