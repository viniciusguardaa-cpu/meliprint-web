import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import pool from '../db.js';

/** Constant-time string compare (hashes first so length never leaks). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// A distinct cookie and store namespace isolate admin login/logout from user sessions.
// Admin credentials never leave the server as a reusable bearer token.
const adminStore = process.env.REDIS_URL
  ? new RedisStore({ client: new Redis(process.env.REDIS_URL), prefix: 'admin:' })
  : process.env.DATABASE_URL
    ? new (connectPgSimple(session))({ pool, tableName: 'session' })
    : undefined;

export const adminSession = session({
  name: 'labelgo.admin.sid',
  store: adminStore,
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'labelgo-dev-secret'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});

/** Bind sessions to current credentials, so a password change invalidates old logins. */
export function adminCredentialVersion(): string | null {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return null;
  return crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(`${process.env.ADMIN_USERNAME}\0${process.env.ADMIN_PASSWORD}`).digest('hex');
}

export function validBrowserOrigin(req: Request): boolean {
  const origin = req.header('origin');
  const allowed = process.env.FRONTEND_URL;
  if (!origin || !allowed) return false;
  try { return origin === new URL(allowed).origin; } catch { return false; }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedKey = req.header('x-admin-key') || '';
  if (adminSecret && providedKey && safeEqual(providedKey, adminSecret)) return next();

  const version = adminCredentialVersion();
  if (!adminSecret && !version) {
    return res.status(503).json({ error: 'Admin panel not configured (ADMIN_SECRET/ADMIN_PASSWORD missing)' });
  }
  if (!version || !req.session.adminCredentialVersion || !safeEqual(req.session.adminCredentialVersion, version)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // SameSite=Strict plus an explicit origin check for state-changing requests.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!validBrowserOrigin(req)) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
  }
  next();
}
