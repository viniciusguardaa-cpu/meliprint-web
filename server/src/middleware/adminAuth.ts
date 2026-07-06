import { Request, Response, NextFunction } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    return res.status(503).json({ error: 'Admin panel not configured (ADMIN_SECRET missing)' });
  }

  const providedKey = req.header('x-admin-key');

  if (!providedKey || providedKey !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
