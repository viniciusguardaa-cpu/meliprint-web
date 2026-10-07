// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { nickname: 'Demo', accounts: [] }, checkAuth: vi.fn(), connectAccount: vi.fn(), logout: vi.fn() }) }));
vi.mock('../../hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: { printHistory: true } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const row = (id: string, provider: string, accountId: number) => ({ accountId, shipmentId: id, marketplace: provider, buyerNickname: id, items: 'Item', canPrint: true, status: 'ready_to_ship', substatus: 'ready_to_print' });
function page(initial = '/dashboard') {
  vi.stubGlobal('fetch', vi.fn(async (input) => ({ ok: true, status: 200, json: async () => String(input).includes('print-history') ? { events: [{ id: 1, provider: 'shopee', shipment_id: 'SH-HISTORY', created_at: '2026-10-07', source: 'browser' }, { id: 2, provider: 'mercadolivre', shipment_id: 'ML-HISTORY', created_at: '2026-10-07', source: 'browser' }] } : { ready: [row('ML-1', 'mercadolivre', 1), row('SH-1', 'shopee', 2)], reprint: [row('ML-R', 'mercadolivre', 1), row('SH-R', 'shopee', 2)], providers: [] } })));
  return render(<MemoryRouter initialEntries={[initial]}><Dashboard /></MemoryRouter>);
}
it('identifies every marketplace, filters counts, and clears hidden selection', async () => {
  page(); await screen.findAllByText('ML-1');
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar Todos' }));
  expect(screen.getByRole('button', { name: 'Imprimir (2)' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar pedidos Shopee' }));
  expect(screen.queryAllByText('ML-1')).toHaveLength(0);
  expect(screen.getByText('Pronto (1)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Imprimir (0)' })).toBeTruthy();
  expect(within(screen.getByRole('table')).getByText('Shopee')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar todos os marketplaces' }));
  expect(screen.getAllByText('ML-1').length).toBeGreaterThan(0);
});
it('applies URL filter to ready, reprint and history', async () => {
  page('/dashboard?marketplace=shopee'); await screen.findAllByText('SH-1');
  expect(screen.queryAllByText('ML-1')).toHaveLength(0);
  fireEvent.click(screen.getByText('Reimpressão (1)'));
  expect(screen.getAllByText('SH-R').length).toBeGreaterThan(0); expect(screen.queryAllByText('ML-R')).toHaveLength(0);
  fireEvent.click(screen.getByText('Histórico'));
  await screen.findByText('#SH-HISTORY'); expect(screen.queryByText('#ML-HISTORY')).toBeNull();
});
