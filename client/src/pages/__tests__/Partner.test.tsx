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

it('shows the username+password login form when there is no session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));
  render(<Partner />);
  expect(await screen.findByLabelText('Usuário')).toBeTruthy();
  expect(screen.getByLabelText('Senha')).toBeTruthy();
});

it('can switch to the access-key login', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));
  render(<Partner />);
  fireEvent.click(await screen.findByRole('button', { name: /Entrar com chave de acesso/ }));
  expect(screen.getByLabelText('Chave de acesso')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Entrar com usuário e senha/ }));
  expect(screen.getByLabelText('Usuário')).toBeTruthy();
});

it('logs in with username and password', async () => {
  const f = vi.fn()
    .mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) }) // initial dashboard check
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ok: true }) }) // login
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => dash }); // dashboard after login
  vi.stubGlobal('fetch', f);
  render(<Partner />);
  fireEvent.change(await screen.findByLabelText('Usuário'), { target: { value: 'ecommercefree' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-secreta-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(f).toHaveBeenCalledTimes(3));
  const [url, init] = f.mock.calls[1];
  expect(url).toBe('/api/partner/login');
  expect(JSON.parse(init.body)).toEqual({ username: 'ecommercefree', password: 'senha-secreta-1' });
  expect(await screen.findByText('Olá, Ecommerce Free')).toBeTruthy();
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

it('lets the partner change the password and blocks mismatched confirmation', async () => {
  const f = vi.fn()
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => dash }) // dashboard
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ok: true }) }); // password change
  vi.stubGlobal('fetch', f);
  render(<Partner />);
  expect(await screen.findByText('Trocar senha')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'atual-12345' } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'nova-12345' } });
  fireEvent.change(screen.getByLabelText('Repetir nova senha'), { target: { value: 'diferente-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
  expect(await screen.findByText('As senhas novas não coincidem')).toBeTruthy();
  expect(f).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Repetir nova senha'), { target: { value: 'nova-12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
  await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  const [url, init] = f.mock.calls[1];
  expect(url).toBe('/api/partner/password');
  expect(JSON.parse(init.body)).toEqual({ current_password: 'atual-12345', new_password: 'nova-12345' });
  expect(await screen.findByText('Senha alterada com sucesso.')).toBeTruthy();
});
