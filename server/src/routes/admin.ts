import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import pool, {
  getAllSubscribers,
  getAdminStats,
  getAdminUserDetail,
  getAdminTimeseries,
  getFreeAccessList,
  addFreeAccess,
  removeFreeAccess,
  getAgentStatusCounts,
  getUserById,
  setUserBlocked,
  grantUserTrialDays
} from '../db.js';
import { getGrowthMetrics } from '../services/analytics.js';
import { getExperimentResults } from '../services/pricing.js';

const router = Router();

router.use(requireAdmin);

router.get('/subscribers', async (_req: Request, res: Response) => {
  try {
    const subscribers = await getAllSubscribers();
    res.json({ subscribers });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getAdminStats();
    const agents = await getAgentStatusCounts();

    // MRR breakdown by plan — PAID only: trialing and free-access courtesy
    // accounts are excluded (trials are not revenue).
    const mrrByPlan = await pool.query(`
      SELECT
        s."plan_id",
        p."name" AS plan_name,
        COUNT(*) AS subscription_count,
        COALESCE(SUM(s."contracted_amount"), 0) AS mrr
      FROM "subscriptions" s
      JOIN "users" u ON u."id" = s."user_id"
      LEFT JOIN "plans" p ON p."id" = s."plan_id"
      WHERE s."status" IN ('authorized', 'active')
        AND s."plan_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "free_access" f WHERE LOWER(f."email") = LOWER(u."email")
        )
      GROUP BY s."plan_id", p."name"
      ORDER BY mrr DESC
    `);

    // Trial stats
    const trials = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'trialing') AS active_trials,
        COUNT(*) FILTER (WHERE "status" = 'trial_expired') AS expired_trials,
        COUNT(*) FILTER (WHERE "status" = 'trialing' AND "trial_ends_at" < CURRENT_TIMESTAMP + INTERVAL '1 day') AS trials_expiring_24h
      FROM "subscriptions"
    `);

    res.json({
      totalUsers: Number(stats.total_users),
      activeSubscriptions: Number(stats.active_subscriptions),
      mrr: Number(stats.mrr),
      cancelledSubscriptions: Number(stats.cancelled_subscriptions),
      agentsOnline: Number(agents.online),
      agentsOffline: Number(agents.offline),
      mrrByPlan: mrrByPlan.rows.map((r: any) => ({
        planId: r.plan_id,
        planName: r.plan_name,
        count: Number(r.subscription_count),
        mrr: Number(r.mrr),
      })),
      trials: {
        active: Number(trials.rows[0].active_trials),
        expired: Number(trials.rows[0].expired_trials),
        expiring24h: Number(trials.rows[0].trials_expiring_24h),
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Daily signups/prints/cancellations + period totals for the charts.
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days) || 30;
    res.json(await getAdminTimeseries(days));
  } catch (error) {
    console.error('Error fetching admin timeseries:', error);
    res.status(500).json({ error: 'Failed to fetch timeseries' });
  }
});

// Full detail of a single client: identity, subscriptions, usage, agent, UTM.
router.get('/users/:id', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    const detail = await getAdminUserDetail(userId);
    if (!detail.user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(detail);
  } catch (error) {
    console.error('Error fetching user detail:', error);
    res.status(500).json({ error: 'Failed to fetch user detail' });
  }
});

// Suspend / reactivate a client account.
router.post('/users/:id/block', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    const updated = await setUserBlocked(userId, true);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, blockedAt: updated.blocked_at });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

router.post('/users/:id/unblock', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    const updated = await setUserBlocked(userId, false);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Grant or extend a trial by N days (admin override — bypasses the
// one-trial-per-account rule on purpose).
router.post('/users/:id/extend-trial', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const days = Number(req.body?.days);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'days must be between 1 and 365' });
  }
  try {
    if (!(await getUserById(userId))) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { subscription, created } = await grantUserTrialDays(userId, Math.floor(days));
    res.json({ ok: true, created, trialEndsAt: subscription.trial_ends_at });
  } catch (error) {
    console.error('Error extending trial:', error);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

// Growth metrics: funnel, UTM performance, agents, prints
router.get('/growth', async (_req: Request, res: Response) => {
  try {
    const metrics = await getGrowthMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching growth metrics:', error);
    res.status(500).json({ error: 'Failed to fetch growth metrics' });
  }
});

// Pricing experiment results
router.get('/experiments/:id', async (req: Request, res: Response) => {
  try {
    const experimentId = Number(req.params.id);
    if (!Number.isFinite(experimentId)) {
      return res.status(400).json({ error: 'Invalid experiment id' });
    }
    const results = await getExperimentResults(experimentId);
    res.json({ results });
  } catch (error) {
    console.error('Error fetching experiment results:', error);
    res.status(500).json({ error: 'Failed to fetch experiment results' });
  }
});

router.get('/free-access', async (_req: Request, res: Response) => {
  try {
    const list = await getFreeAccessList();
    res.json({ freeAccess: list });
  } catch (error) {
    console.error('Error fetching free access list:', error);
    res.status(500).json({ error: 'Failed to fetch free access list' });
  }
});

router.post('/free-access', async (req: Request, res: Response) => {
  const { email, note } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const entry = await addFreeAccess(email, note);
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error adding free access:', error);
    res.status(500).json({ error: 'Failed to add free access' });
  }
});

router.delete('/free-access/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    await removeFreeAccess(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing free access:', error);
    res.status(500).json({ error: 'Failed to remove free access' });
  }
});

export default router;
