import { Request, Response, NextFunction } from 'express';
import { getUserByMlId, getActiveSubscription, isFreeAccessEmail } from '../db.js';

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const userEmail = req.session.userEmail?.toLowerCase();
    if (userEmail && await isFreeAccessEmail(userEmail)) {
      return next();
    }

    const user = await getUserByMlId(req.session.userId);
    if (!user) {
      return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária para usar este recurso' });
    }

    const subscription = await getActiveSubscription(user.id);
    if (!subscription) {
      return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária para usar este recurso' });
    }

    next();
  } catch (error) {
    console.error('Error checking subscription in middleware:', error);
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
}
