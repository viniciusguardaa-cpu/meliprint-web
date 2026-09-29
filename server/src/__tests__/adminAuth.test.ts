import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminCredentialVersion, requireAdmin, validBrowserOrigin } from '../middleware/adminAuth.js';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

function request(method = 'GET', origin = 'https://labelgo.com.br', key = ''): any {
  return { method, header: (name: string) => name === 'origin' ? origin : name === 'x-admin-key' ? key : '', session: { adminCredentialVersion: adminCredentialVersion() } };
}

describe('admin session guard', () => {
  it('binds the session to current credentials and rejects stale sessions', () => {
    process.env.ADMIN_USERNAME = 'owner'; process.env.ADMIN_PASSWORD = 'old'; process.env.SESSION_SECRET = 'secret';
    process.env.FRONTEND_URL = 'https://labelgo.com.br';
    const stale = request(); process.env.ADMIN_PASSWORD = 'new';
    const status = vi.fn().mockReturnThis(); const json = vi.fn();
    requireAdmin(stale, { status, json } as any, vi.fn());
    expect(status).toHaveBeenCalledWith(401);
  });

  it('allows the automation secret and blocks cross-origin session writes', () => {
    process.env.ADMIN_USERNAME = 'owner'; process.env.ADMIN_PASSWORD = 'pass'; process.env.SESSION_SECRET = 'secret';
    process.env.ADMIN_SECRET = 'automation'; process.env.FRONTEND_URL = 'https://labelgo.com.br';
    const next = vi.fn(); const status = vi.fn().mockReturnThis(); const json = vi.fn();
    requireAdmin(request('POST', 'https://evil.example'), { status, json } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    requireAdmin(request('POST', '', 'automation'), { status, json } as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(validBrowserOrigin(request('POST', 'https://labelgo.com.br'))).toBe(true);
    expect(validBrowserOrigin(request('POST', 'https://evil.example'))).toBe(false);
  });
});
