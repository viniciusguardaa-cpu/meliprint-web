import { describe, it, expect, vi, afterEach } from 'vitest';
// The Pages function is JavaScript, outside the server TypeScript build.
// @ts-expect-error No declaration file for the Pages function module.
import { onRequest } from '../../../functions/api/[[path]].js';

afterEach(() => vi.unstubAllGlobals());
describe('Pages API proxy', () => {
  it('fails closed without a configured backend', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await onRequest({ request: new Request('https://labelgo.com.br/api/health'), env: {} });
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves path, query, and Set-Cookie against the configured backend', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok', { headers: { 'Set-Cookie': 'sid=abc; HttpOnly; Secure' } }));
    vi.stubGlobal('fetch', fetch);
    const response = await onRequest({ request: new Request('https://labelgo.com.br/api/admin/session?days=30'), env: { BACKEND_URL: 'https://web.example' } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0].url).toBe('https://web.example/api/admin/session?days=30');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });
});
