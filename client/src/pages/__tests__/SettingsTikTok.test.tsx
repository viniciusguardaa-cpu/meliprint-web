// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../Settings';

const auth = vi.hoisted(() => ({
  user: { nickname: 'Teste', accounts: [] as Array<{ id: number; provider: string; externalUserId: string; nickname?: string; status?: string }> },
  connectAccount: vi.fn(), disconnectAccount: vi.fn(), checkAuth: vi.fn(), logout: vi.fn()
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: null }) }));

beforeEach(() => { vi.resetAllMocks(); auth.user.accounts = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function page(configured: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ providers: [
    { id: 'mercadolivre', displayName: 'Mercado Livre', configured: true },
    { id: 'shopee', displayName: 'Shopee', configured: true },
    { id: 'tiktok', displayName: 'TikTok Shop', configured }
  ] }) })));
  return render(<MemoryRouter><Settings /></MemoryRouter>);
}
it('shows TikTok next to the existing connections and starts its OAuth with a return to Settings', async () => {
  page(true);
  const card = await screen.findByRole('group', { name: 'TikTok Shop' });
  expect(screen.getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual(['Mercado Livre', 'Shopee', 'TikTok Shop']);
  expect(within(card).getByText(/impressora já configurada/)).toBeTruthy();
  const button = within(card).getByRole('button', { name: 'Conectar TikTok Shop' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(auth.connectAccount).toHaveBeenCalledWith('tiktok', '/configuracoes'));
  expect(auth.connectAccount).toHaveBeenCalledOnce();
});
it('keeps the connection visible but disabled while the integration is unavailable', async () => {
  page(false);
  const card = await screen.findByRole('group', { name: 'TikTok Shop' });
  const button = within(card).getByRole('button', { name: 'Conectar TikTok Shop' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(within(card).getByText(/após a liberação/)).toBeTruthy();
  fireEvent.click(button); expect(auth.connectAccount).not.toHaveBeenCalled();
});
it('shows the linked shop and lets the same owner authorize another TikTok account', async () => {
  auth.user.accounts = [{ id: 7, provider: 'tiktok', externalUserId: '9000000000000000001', nickname: 'Loja teste', status: 'active' }];
  page(true);
  const card = await screen.findByRole('group', { name: 'TikTok Shop' });
  expect(within(card).getByText('Conectado')).toBeTruthy();
  expect(within(card).getByText('Loja teste')).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Conectar outra conta TikTok Shop' }));
  await waitFor(() => expect(auth.connectAccount).toHaveBeenCalledWith('tiktok', '/configuracoes'));
});
it('shows an OAuth failure without marking the shop as connected', async () => {
  auth.connectAccount.mockRejectedValue(new Error('Permissão TikTok indisponível.'));
  page(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Conectar TikTok Shop' }));
  expect(await screen.findByText('Permissão TikTok indisponível.')).toBeTruthy();
  expect(screen.queryByText('Conectado')).toBeNull();
});
