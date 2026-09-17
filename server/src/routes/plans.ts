import { Router, Request, Response } from 'express';
import { getActivePlans, getActiveExperimentForPlan, getVariantsForExperiment, assignVariant, linkAssignmentToUser } from '../services/pricing.js';

const router = Router();

/**
 * GET /api/plans — public catalog of active plans with prices.
 * Frontend uses this instead of hardcoded prices.
 * Supports pricing experiments: if an active experiment exists for a plan,
 * the visitor is assigned a variant and sees that variant's price.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const plans = await getActivePlans();
    const visitorKey = (req.query.visitor_key as string) || req.header('x-visitor-key') || '';

    const result = [];
    for (const plan of plans) {
      let displayPrice = plan.price;
      let experimentVariant: string | null = null;

      // Check for active pricing experiment
      if (visitorKey && plan.price) {
        const experiment = await getActiveExperimentForPlan(plan.id);
        if (experiment) {
          const variants = await getVariantsForExperiment(experiment.id);
          if (variants.length > 0) {
            const variant = await assignVariant(experiment.id, visitorKey, variants);
            // Override the displayed price with the experiment variant price
            displayPrice = { ...plan.price, amount: variant.amount };
            experimentVariant = variant.label;
          }
        }
      }

      result.push({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        autoPrint: plan.auto_print,
        slaQueue: plan.sla_queue,
        packingCheck: plan.packing_check,
        printHistory: plan.print_history,
        features: plan.features,
        price: displayPrice ? {
          amount: displayPrice.amount,
          currency: displayPrice.currency,
          billingPeriod: displayPrice.billing_period,
        } : null,
        experimentVariant,
      });
    }

    res.json({ plans: result });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

export default router;
