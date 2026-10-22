// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Partner from '../Partner';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const dash = {
  partner: { name: 'Ecommerce Free', ref_code: 'ecommercefree', link: 'https://labelgo.com.br/?ref=ecommercefree', is_active: true, commission_pct: 20, commission_months: null },
  summary: { visitors: 10, signups: 2, trials: 1, paid: 1, cancelled: 0, commission: { monthly: 3.98, accrued: 3.98 } },
  referrals: [
    { label: 'Cliente #2', signed_up_at: '2026-10-02T10:00:00Z', status: 'paid', first_paid_at: '2026-10-05T10:00:00Z' },
    { label: 'Cliente #1', signed_up_at: '2026-10-01T10:00:00Z', status: 'trial', first_paid_at: null },
  ],
};

it('shows the login form when there is no session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));
  render(<Partner />);
  expect(await screen.findByLabelText('Chave de acesso')).toBeTruthy();
});

it('shows only anonymous referrals, the link and copies it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => dash }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<Partner />);
  expect(await screen.findByText('Olá, Ecommerce Free')).toBeTruthy();
  expect(screen.getByTestId('partner-link').textContent).toBe(dash.partner.link);
  expect(screen.getByText('Cliente #1')).toBeTruthy();
  expect(screen.getByText('20% do faturamento bruto · prazo a definir', { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(dash.partner.link));
});
