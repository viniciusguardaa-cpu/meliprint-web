import pool from '../db.js';

// ---------------------------------------------------------------------------
// Plans & Prices
// ---------------------------------------------------------------------------

export interface Plan {
  id: string;
  name: string;
  description: string;
  auto_print: boolean;
  sla_queue: boolean;
  packing_check: boolean;
  print_history: boolean;
  is_active: boolean;
  sort_order: number;
  features: string[];
}

export interface Price {
  id: number;
  plan_id: string;
  billing_period: string;
  amount: number;
  currency: string;
  is_active: boolean;
}

export interface PlanWithPrice extends Plan {
  price: Price | null;
}

export async function getActivePlans(): Promise<PlanWithPrice[]> {
  const result = await pool.query(
    `SELECT p.*, pr.id AS price_id, pr.billing_period, pr.amount, pr.currency, pr.is_active AS price_active
     FROM "plans" p
     LEFT JOIN "prices" pr ON pr.plan_id = p.id AND pr.is_active = true AND pr.billing_period = 'monthly'
     WHERE p.is_active = true
     ORDER BY p.sort_order ASC`
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    auto_print: row.auto_print,
    sla_queue: row.sla_queue ?? false,
    packing_check: row.packing_check ?? false,
    print_history: row.print_history ?? false,
    is_active: row.is_active,
    sort_order: row.sort_order,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features || []),
    price: row.price_id ? {
      id: row.price_id,
      plan_id: row.id,
      billing_period: row.billing_period,
      amount: Number(row.amount),
      currency: row.currency,
      is_active: row.price_active,
    } : null,
  }));
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const result = await pool.query(`SELECT * FROM "plans" WHERE "id" = $1`, [planId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    auto_print: row.auto_print,
    sla_queue: row.sla_queue ?? false,
    packing_check: row.packing_check ?? false,
    print_history: row.print_history ?? false,
    is_active: row.is_active,
    sort_order: row.sort_order,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features || []),
  };
}

export async function getPriceForPlan(planId: string, billingPeriod = 'monthly'): Promise<Price | null> {
  const result = await pool.query(
    `SELECT * FROM "prices" WHERE "plan_id" = $1 AND "billing_period" = $2 AND "is_active" = true`,
    [planId, billingPeriod]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    billing_period: row.billing_period,
    amount: Number(row.amount),
    currency: row.currency,
    is_active: row.is_active,
  };
}

/** Check if a plan grants a specific feature (auto_print, sla_queue, packing_check, print_history). */
export async function planHasFeature(planId: string, feature: 'auto_print' | 'sla_queue' | 'packing_check' | 'print_history'): Promise<boolean> {
  const plan = await getPlan(planId);
  return plan ? plan[feature] === true : false;
}

// ---------------------------------------------------------------------------
// Pricing experiments (A/B)
// ---------------------------------------------------------------------------

export interface PricingExperiment {
  id: number;
  name: string;
  plan_id: string;
  is_active: boolean;
}

export interface PricingVariant {
  id: number;
  experiment_id: number;
  label: string;
  amount: number;
  weight: number;
}

export async function getActiveExperimentForPlan(planId: string): Promise<PricingExperiment | null> {
  const result = await pool.query(
    `SELECT * FROM "pricing_experiments" WHERE "plan_id" = $1 AND "is_active" = true LIMIT 1`,
    [planId]
  );
  return result.rows[0] || null;
}

export async function getVariantsForExperiment(experimentId: number): Promise<PricingVariant[]> {
  const result = await pool.query(
    `SELECT * FROM "pricing_variants" WHERE "experiment_id" = $1 ORDER BY "label" ASC`,
    [experimentId]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    experiment_id: row.experiment_id,
    label: row.label,
    amount: Number(row.amount),
    weight: row.weight,
  }));
}

/**
 * Assign a visitor to a variant (persisted). Returns the variant.
 * If already assigned, returns the existing assignment.
 */
export async function assignVariant(
  experimentId: number,
  visitorKey: string,
  variants: PricingVariant[]
): Promise<PricingVariant> {
  // Check existing assignment
  const existing = await pool.query(
    `SELECT v.* FROM "pricing_assignments" a
     JOIN "pricing_variants" v ON a.variant_id = v.id
     WHERE a.experiment_id = $1 AND a.visitor_key = $2`,
    [experimentId, visitorKey]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return { id: row.id, experiment_id: row.experiment_id, label: row.label, amount: Number(row.amount), weight: row.weight };
  }

  // Weighted random assignment
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  let chosen = variants[0];
  for (const v of variants) {
    random -= v.weight;
    if (random <= 0) { chosen = v; break; }
  }

  try {
    await pool.query(
      `INSERT INTO "pricing_assignments" ("experiment_id", "variant_id", "visitor_key") VALUES ($1, $2, $3)`,
      [experimentId, chosen.id, visitorKey]
    );
  } catch (err: any) {
    // Race condition: another request assigned first. Re-read.
    if (err.code === '23505') {
      return assignVariant(experimentId, visitorKey, variants);
    }
    throw err;
  }

  return chosen;
}

/**
 * The price a visitor must actually be charged: if an active experiment
 * assigned them a variant (visible in the /api/plans catalog), the checkout
 * must charge THAT amount — never a different one.
 * Returns null when there is no experiment/assignment (use standard price).
 */
export async function getAssignedVariantPrice(
  planId: string,
  visitorKey: string
): Promise<(Price & { experiment_variant_id?: number }) | null> {
  const experiment = await getActiveExperimentForPlan(planId);
  if (!experiment) return null;

  const result = await pool.query(
    `SELECT v."id" AS variant_id, v."amount"
     FROM "pricing_assignments" a
     JOIN "pricing_variants" v ON v."id" = a."variant_id"
     WHERE a."experiment_id" = $1 AND a."visitor_key" = $2`,
    [experiment.id, visitorKey]
  );
  const row = result.rows[0];
  if (!row) return null; // visitor never got a variant → standard price

  const base = await getPriceForPlan(planId, 'monthly');
  if (!base) return null;
  return { ...base, amount: Number(row.amount), experiment_variant_id: row.variant_id };
}

/** Link a pricing assignment to a user after signup. */
export async function linkAssignmentToUser(visitorKey: string, userId: number) {
  await pool.query(
    `UPDATE "pricing_assignments" SET "user_id" = $2 WHERE "visitor_key" = $1 AND "user_id" IS NULL`,
    [visitorKey, userId]
  );
}

// ---------------------------------------------------------------------------
// Experiment results (for admin dashboard)
// ---------------------------------------------------------------------------

export async function getExperimentResults(experimentId: number) {
  const variants = await getVariantsForExperiment(experimentId);
  const results = [];
  for (const v of variants) {
    const assignments = await pool.query(
      `SELECT COUNT(*) AS count FROM "pricing_assignments" WHERE "variant_id" = $1`,
      [v.id]
    );
    const checkouts = await pool.query(
      `SELECT COUNT(*) AS count FROM "billing_events" WHERE "metadata"->>'experiment_variant_id' = $1 AND "event_type" = 'checkout_started'`,
      [String(v.id)]
    );
    const conversions = await pool.query(
      `SELECT COUNT(*) AS count FROM "billing_events" WHERE "metadata"->>'experiment_variant_id' = $1 AND "event_type" = 'subscription_activated'`,
      [String(v.id)]
    );
    results.push({
      variant_id: v.id,
      label: v.label,
      amount: v.amount,
      assignments: Number(assignments.rows[0].count),
      checkouts: Number(checkouts.rows[0].count),
      conversions: Number(conversions.rows[0].count),
      conversion_rate: Number(assignments.rows[0].count) > 0
        ? (Number(conversions.rows[0].count) / Number(assignments.rows[0].count)) * 100
        : 0,
    });
  }
  return results;
}
