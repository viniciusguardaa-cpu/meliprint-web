// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pricing from '../Pricing';
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../../lib/analytics', () => ({ getVisitorKey: () => 'test', track: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const offer = (id: string, amount: number) => ({ id, name: 'LabelGo Completo', description: 'Tudo incluído', features: ['Fila por prazo', 'Conferência', 'Impressão automática', 'Histórico'], price: { amount, currency: 'BRL', billingPeriod: 'monthly' } });
async function page(founder = true) {
  vi.stubGlobal('fetch', vi.fn(async input => ({ ok: true, json: async () => String(input).includes('/plans') ? { plans: [offer('pro', 19.9), ...(founder ? [offer('founder', 7.9)] : [])] } : { canTrial: true } })));
  render(<MemoryRouter><Pricing /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'LabelGo Completo' });
}
it('shows one complete card, all features and locked Founder promotion', async () => {
  await page();
  expect(screen.getAllByRole('heading', { name: 'LabelGo Completo' })).toHaveLength(1);
  expect(screen.getByText('PROMOÇÃO DE FUNDADOR - 20 VAGAS')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Assinar completo por R$ 7,90/mês' })).toBeTruthy();
  expect(screen.getByText('Impressão automática')).toBeTruthy();
  expect(screen.getByText('Histórico')).toBeTruthy();
  expect(screen.queryByText(/Start/)).toBeNull();
});
it('after Founder sells out offers the same complete card at regular price', async () => {
  await page(false);
  expect(screen.queryByText('PROMOÇÃO DE FUNDADOR - 20 VAGAS')).toBeNull();
  expect(screen.getByText('19')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Assinar completo agora' })).toBeTruthy();
  expect(screen.getByText('Impressão automática')).toBeTruthy();
});
