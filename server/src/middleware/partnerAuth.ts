import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import pool from '../db.js';
import { validBrowserOrigin } from './adminAuth.js';

// Separate cookie + store namespace: a partner session can never act as an
// admin or customer session (and vice versa).
const partnerStore = process.env.REDIS_URL
  ? new RedisStore({ client: new Redis(process.env.REDIS_URL), prefix: 'partner:' })
  : process.env.DATABASE_URL
    ? new (connectPgSimple(session))({ pool, tableName: 'session' })
    : undefined;

export const partnerSession = session({
  name: 'labelgo.partner.sid',
  store: partnerStore,
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'labelgo-dev-secret'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/partner',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});

export function requirePartner(req: Request, res: Response, next: NextFunction) {
  const partnerId = (req.session as any)?.partnerId;
  if (!partnerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validBrowserOrigin(req)) {
    return res.status(403).json({ error: 'Invalid origin' });
  }
  next();
}
