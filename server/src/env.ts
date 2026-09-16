/**
 * Startup environment validation. In production, missing required secrets
 * cause a hard startup failure (fail-closed). In development we warn but allow.
 */

const REQUIRED_PROD = [
  'ML_CLIENT_ID',
  'ML_CLIENT_SECRET',
  'ML_REDIRECT_URI',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'ADMIN_SECRET',
  'DATABASE_URL',
];

export function assertRequiredEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    const missing = REQUIRED_PROD.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      console.warn(`⚠️  Missing optional-in-dev env vars: ${missing.join(', ')}`);
    }
    return;
  }

  const missing = REQUIRED_PROD.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start in production: missing required environment variables: ${missing.join(', ')}`
    );
  }
}
