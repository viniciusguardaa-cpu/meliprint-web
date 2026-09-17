import crypto from 'crypto';

/**
 * AES-256-GCM encryption for sensitive data at rest (ML access/refresh tokens).
 *
 * Ciphertext format: `enc:v1:<ivB64>:<tagB64>:<ctB64>`
 * Legacy plaintext values (no `enc:v1:` prefix) are detected on read and
 * transparently re-encrypted on the next write (lazy migration, no data loss).
 *
 * Requires ENCRYPTION_KEY (32 bytes, base64) in production. Fail-closed.
 */

const PREFIX = 'enc:v1:';
const KEY_BYTES = 32; // AES-256

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production (32 bytes, base64)');
    }
    // Development: derive a stable ephemeral key so the app still runs locally.
    // Never used in production. Logged once at startup.
    return crypto.createHash('sha256').update('labelgo-dev-key').digest();
  }
  let key: Buffer;
  // Accept either raw base64 of 32 bytes, or a hex string, or a utf8 passphrase (hashed).
  try {
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === KEY_BYTES) return b64;
  } catch { /* not base64 */ }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
    if (key.length === KEY_BYTES) return key;
  }
  // Treat as passphrase -> derive with HKDF-like SHA-256 (deterministic, stable).
  return crypto.createHash('sha256').update(raw).digest();
}

let warnedDevKey = false;
function keyForOp(): Buffer {
  const key = getKey();
  if (!process.env.ENCRYPTION_KEY && !warnedDevKey && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  ENCRYPTION_KEY not set — using derived dev key. Set ENCRYPTION_KEY (32 bytes base64) in production.');
    warnedDevKey = true;
  }
  return key;
}

export function encrypt(plaintext: string): string {
  if (plaintext === null || plaintext === undefined) return plaintext;
  // Already encrypted? leave as-is (idempotent).
  if (typeof plaintext === 'string' && plaintext.startsWith(PREFIX)) return plaintext;
  const key = keyForOp();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(value: string): string {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext — return as-is. Caller may re-encrypt on next write.
    return value;
  }
  const key = keyForOp();
  const rest = value.slice(PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) throw new Error('Malformed ciphertext');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** True if the stored value is legacy plaintext (needs re-encryption on next write). */
export function isLegacyPlaintext(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !value.startsWith(PREFIX);
}
