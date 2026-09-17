import { Request, Response, NextFunction } from 'express';
import { getUserById, getEntitledSubscription, isFreeAccessEmail } from '../db.js';
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
    const user = await getUserById(req.session.userId);
    if (!user) {
      return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária para usar este recurso' });
    }
    if (user.blocked_at) {
      return res.status(403).json({ error: 'account_blocked', message: 'Conta suspensa. Fale com o suporte.' });
    }

    // Check if user has free lifetime access
    const userEmail = user.email?.toLowerCase();
    if (userEmail && await isFreeAccessEmail(userEmail)) {
      (req as any).planId = 'pro';
      (req as any).userId = user.id;
      return next();
    }

    // Entitled = authorized/active, in-window trial, or cancelled but still
    // inside the contracted period (access until current_period_end).
    const subscription = await getEntitledSubscription(user.id);
    if (!subscription) {
      return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária para usar este recurso' });
    }

    (req as any).planId = subscription.plan_id;
    (req as any).subscription = subscription;
    (req as any).userId = user.id;
    next();
  } catch (error) {
    console.error('Error checking subscription in middleware:', error);
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

/** Plan-gated features — each maps to a boolean column on plans. */
export type PlanFeature = 'auto_print' | 'sla_queue' | 'packing_check' | 'print_history';

/**
 * Require a plan that has a specific feature (e.g., auto_print).
 * Used for Pro-only features like automatic printing.
 * Returns an Express middleware factory.
 */
export function requirePlanFeature(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // First, require any active subscription (inline check)
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = await getUserById(req.session.userId);
      if (!user) {
        return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária' });
      }
      if (user.blocked_at) {
        return res.status(403).json({ error: 'account_blocked', message: 'Conta suspensa. Fale com o suporte.' });
      }

      const userEmail = user.email?.toLowerCase();
      if (userEmail && await isFreeAccessEmail(userEmail)) {
        (req as any).planId = 'pro';
        (req as any).userId = user.id;
        return next();
      }

      const subscription = await getEntitledSubscription(user.id);
      if (!subscription) {
        return res.status(403).json({ error: 'subscription_required', message: 'Assinatura ativa necessária' });
      }

      const planId = subscription.plan_id;
      if (!planId) {
        return res.status(403).json({ error: 'plan_required', message: 'Plano Pro necessário para este recurso' });
      }

      const plan = await getPlan(planId);
      if (!plan) {
        return res.status(403).json({ error: 'plan_required', message: 'Plano não encontrado' });
      }

      const hasFeature = plan[feature] === true;
      if (!hasFeature) {
        return res.status(403).json({
          error: 'plan_upgrade_required',
          message: `Seu plano (${plan.name}) não inclui este recurso. Faça upgrade para o LabelGo Pro.`
        });
      }

      (req as any).planId = planId;
      (req as any).subscription = subscription;
      (req as any).userId = user.id;
      next();
    } catch (error) {
      console.error('Error checking plan feature:', error);
      res.status(500).json({ error: 'Failed to verify plan' });
    }
  };
}
