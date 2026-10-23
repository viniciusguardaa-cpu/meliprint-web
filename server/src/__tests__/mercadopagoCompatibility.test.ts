import { afterEach, expect, it, vi } from 'vitest';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';

afterEach(() => vi.unstubAllGlobals());

it('preserves subscription lookup with the upgraded Mercado Pago SDK', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    id: 'pa-1', status: 'authorized', next_payment_date: '2026-11-21T00:00:00Z',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const client = new PreApproval(new MercadoPagoConfig({ accessToken: 'test-token' }));
  const result = await client.get({ id: 'pa-1' });
  expect(result.status).toBe('authorized');
  expect(result.next_payment_date).toBe('2026-11-21T00:00:00Z');
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toBe('https://api.mercadopago.com/preapproval/pa-1');
  expect(new Headers(call[1].headers).get('authorization')).toBe('Bearer test-token');
});
