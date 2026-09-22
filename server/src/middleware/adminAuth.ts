import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/** Constant-time string compare (hashes first so length never leaks). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Token entregue pelo POST /api/admin/login após validar usuário/senha.
 * Derivado de ADMIN_PASSWORD + SESSION_SECRET: sobrevive a restarts e é
 * invalidado automaticamente quando a senha muda. Não é persistido.
 */
export function adminToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) return null;
  return crypto.createHmac('sha256', secret).update(`admin:${password}`).digest('hex');
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  const token = adminToken();

  if (!adminSecret && !token) {
    return res.status(503).json({ error: 'Admin panel not configured (ADMIN_SECRET/ADMIN_PASSWORD missing)' });
  }

  const providedKey = req.header('x-admin-key') || '';
  const valid =
    (adminSecret && safeEqual(providedKey, adminSecret)) ||
    (token && safeEqual(providedKey, token));

  if (!providedKey || !valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
