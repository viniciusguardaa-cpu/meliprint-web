import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, isLegacyPlaintext } from '../services/crypto.js';

describe('token encryption (AES-256-GCM)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('encrypts and decrypts round-trip with a base64 key', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    const plaintext = 'ML_ACCESS_TOKEN_secret_value_123456';
    const ct = encrypt(plaintext);
    expect(ct).not.toBe(plaintext);
    expect(ct.startsWith('enc:v1:')).toBe(true);
    expect(decrypt(ct)).toBe(plaintext);
  });

  it('encrypts and decrypts round-trip with a hex key', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
    const plaintext = 'refresh_token_abc';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('encrypts and decrypts round-trip with a passphrase key', () => {
    process.env.ENCRYPTION_KEY = 'my-secret-passphrase';
    const plaintext = 'token_xyz';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('is idempotent: encrypting already-encrypted value returns same value', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    const plaintext = 'test_token';
    const ct = encrypt(plaintext);
    expect(encrypt(ct)).toBe(ct); // no double-encryption
  });

  it('decrypts legacy plaintext transparently (lazy migration)', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    const legacy = 'plain_old_token_no_prefix';
    expect(decrypt(legacy)).toBe(legacy); // returned as-is
  });

  it('isLegacyPlaintext detects values needing re-encryption', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    expect(isLegacyPlaintext('plain_token')).toBe(true);
    expect(isLegacyPlaintext(encrypt('x'))).toBe(false);
    expect(isLegacyPlaintext(null)).toBe(false);
    expect(isLegacyPlaintext('')).toBe(false);
  });

  it('each encryption produces a different ciphertext (random IV)', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    const plaintext = 'same_value';
    const ct1 = encrypt(plaintext);
    const ct2 = encrypt(plaintext);
    expect(ct1).not.toBe(ct2);
    expect(decrypt(ct1)).toBe(plaintext);
    expect(decrypt(ct2)).toBe(plaintext);
  });

  it('throws in production if ENCRYPTION_KEY is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY is required');
  });

  it('uses dev key if ENCRYPTION_KEY missing in development', () => {
    process.env.NODE_ENV = 'development';
    const plaintext = 'dev_token';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('tampered ciphertext fails to decrypt (auth tag)', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
    const ct = encrypt('secret');
    // Flip a character in the ciphertext portion
    const tampered = ct.slice(0, -2) + (ct.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => decrypt(tampered)).toThrow();
  });
});
