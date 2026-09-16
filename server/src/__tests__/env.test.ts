import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertRequiredEnv } from '../env.js';

describe('assertRequiredEnv (fail-closed secrets)', () => {
  const originalEnv = { ...process.env };
  const REQUIRED = [
    'ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI',
    'SESSION_SECRET', 'ENCRYPTION_KEY', 'MP_ACCESS_TOKEN',
    'MP_WEBHOOK_SECRET', 'ADMIN_SECRET', 'DATABASE_URL',
  ];

  beforeEach(() => {
    // Clear all required vars
    for (const k of REQUIRED) delete process.env[k];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws in production when required vars are missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertRequiredEnv()).toThrow(/missing required environment variables/);
  });

  it('does not throw in production when all required vars are set', () => {
    process.env.NODE_ENV = 'production';
    for (const k of REQUIRED) process.env[k] = 'test-value';
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('does not throw in development when required vars are missing (warns only)', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('names the specific missing vars in the error', () => {
    process.env.NODE_ENV = 'production';
    process.env.ML_CLIENT_ID = 'x';
    process.env.SESSION_SECRET = 'x';
    // Leave others missing
    try {
      assertRequiredEnv();
      expect.fail('should have thrown');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain('ML_CLIENT_SECRET');
      expect(msg).toContain('ENCRYPTION_KEY');
      expect(msg).not.toContain('ML_CLIENT_ID');
    }
  });
});
