import { Request, Response, NextFunction } from 'express';
import { getUserByMlId, getActiveSubscription, isFreeAccessEmail } from '../db.js';
import { getPlan } from '../services/pricing.js';

/**
 * Require any active subscription (or trial, or free access).
 * Used for basic features (shipments, labels, PDF, ZPL, batch).
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Check if user has free lifetime access
    const userEmail = req.session.userEmail?.toLowerCase();
    if (userEmail && await isFreeAccessEmail(userEmail)) {
      (req as any).planId = 'pro';
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

    // Check if trial has expired
    if (subscription.status === 'trialing' && subscription.trial_ends_at) {
      if (new Date(subscription.trial_ends_at) < new Date()) {
        return res.status(403).json({ error: 'trial_expired', message: 'Seu período de teste terminou. Assine um plano para continuar.' });
      }
    }

    (req as any).planId = subscription.plan_id;
    (req as any).subscription = subscription;
    next();
  } catch (error) {
    console.error('Error checking subscription in middleware:', error);
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

/**
 * Require a plan that has a specific feature (e.g., auto_print).
 * Used for Pro-only features like automatic printing.
 * Returns an Express middleware factory.
 */
export function requirePlanFeature(feature: 'auto_print') {
  return async (req: Request, res: Response, next: NextFunction) => {
    // First, require any active subscription (inline check)
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userEmail = req.session.userEmail?.toLowerCase();
      if (userEmail && await isFreeAccessEmail(userEmail)) {
        (req as any).planId = 'pro';
        return next();
      }

      const user = await getUserByMlId(req.session.userId);
      if (!user) {
        return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária' });
      }

      const subscription = await getActiveSubscription(user.id);
      if (!subscription) {
        return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária' });
      }

      // Check if trial has expired
      if (subscription.status === 'trialing' && subscription.trial_ends_at) {
        if (new Date(subscription.trial_ends_at) < new Date()) {
          return res.status(403).json({ error: 'trial_expired', message: 'Seu período de teste terminou.' });
        }
      }

      const planId = subscription.plan_id;
      if (!planId) {
        return res.status(403).json({ error: 'plan_required', message: 'Plano Pro necessário para este recurso' });
      }

      const plan = await getPlan(planId);
      if (!plan) {
        return res.status(403).json({ error: 'plan_required', message: 'Plano não encontrado' });
      }

      const hasFeature = feature === 'auto_print' ? plan.auto_print : false;
      if (!hasFeature) {
        return res.status(403).json({
          error: 'plan_upgrade_required',
          message: `Seu plano (${plan.name}) não inclui este recurso. Faça upgrade para o Printly Pro.`
        });
      }

      (req as any).planId = planId;
      (req as any).subscription = subscription;
      next();
    } catch (error) {
      console.error('Error checking plan feature:', error);
      res.status(500).json({ error: 'Failed to verify plan' });
    }
  };
}
