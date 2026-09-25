import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  getAutoPrintConfig,
  upsertAutoPrintConfig,
  getAutoPrintConfigByAgentToken,
  claimPrintJobs,
  markPrintJobPrinted,
  markPrintJobFailed,
  retryFailedJob,
  getPrintQueueStats,
  updateAgentHeartbeat,
  getUserById,
  hasProAccess,
  getJobsNeedingReview,
  resolveJobReview,
  createPairingCode,
  getMarketplaceAccountsForUser
} from '../db.js';
import pool from '../db.js';
import { getProvider } from '../providers/index.js';
import { requireActiveSubscription, requirePlanFeature } from '../middleware/subscription.js';
import { trackEvent } from '../services/analytics.js';

const router = Router();

// ---------------------------------------------------------------------------
// Routes protected by session (user is logged in via browser)
// ---------------------------------------------------------------------------

// Enable auto-print: requires a connected marketplace account (its tokens in
// marketplace_accounts are what the poller uses), then generates agent token.
// Requires Pro plan (auto_print feature)
router.post('/enable', requirePlanFeature('auto_print'), async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const printerName = (req.body?.printerName as string | undefined)?.trim() || undefined;

  const user = await getUserById(req.session.userId);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  // Auto-print requires at least one connected account whose provider
  // produces ZPL — the agent only prints raw ZPL today (PDF-only providers
  // like Shopee/Bling print via the browser instead).
  const accounts = await getMarketplaceAccountsForUser(user.id);
  const hasZplAccount = accounts.some((a: any) => {
    const provider = getProvider(a.provider);
    return provider?.getLabelsZPL != null;
  });
  if (!hasZplAccount) {
    return res.status(400).json({
      error: 'account_not_connected',
      message: 'Conecte uma conta de marketplace com etiquetas ZPL (Mercado Livre ou Amazon) antes de ativar a impressão automática.'
    });
  }

  const agentToken = crypto.randomBytes(32).toString('hex');

  const config = await upsertAutoPrintConfig(user.id, {
    enabled: true,
    agentToken,
    printerName
  });

  res.json({
    enabled: true,
    agentToken: config.agent_token,
    printerName: config.printer_name
  });
});

// Disable auto-print
router.post('/disable', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  await upsertAutoPrintConfig(user.id, { enabled: false });
  res.json({ enabled: false });
});

// Get current auto-print status + queue stats + agent online/offline
router.get('/status', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  const config = await getAutoPrintConfig(user.id);
  const stats = await getPrintQueueStats(user.id);

  res.json({
    enabled: config?.enabled ?? false,
    agentToken: config?.agent_token ?? null,
    printerName: config?.printer_name ?? null,
    lastPolledAt: config?.last_polled_at ?? null,
    agentStatus: config?.agent_status ?? 'offline',
    lastHeartbeatAt: config?.last_heartbeat_at ?? null,
    queue: stats
  });
});

// Update printer name
router.post('/printer', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const printerName = (req.body?.printerName as string | undefined)?.trim();
  if (!printerName) {
    return res.status(400).json({ error: 'printerName is required' });
  }

  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  await upsertAutoPrintConfig(user.id, { printerName });
  res.json({ printerName });
});

// Manual retry of a failed job (browser session, owner-scoped)
router.post('/queue/:id/retry', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }
  const job = await retryFailedJob(user.id, jobId);
  if (!job) {
    return res.status(404).json({ error: 'Failed job not found for this tenant' });
  }
  res.json({ ok: true, job });
});

// List jobs with uncertain outcome (agent lost contact mid-print). These are
// NEVER auto-reprinted — the owner decides.
router.get('/queue/review', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }
  const jobs = await getJobsNeedingReview(user.id);
  res.json({ jobs });
});

// Resolve a needs_review job: 'requeue' (label did not come out) or
// 'confirm_printed' (user verified the label was printed).
router.post('/queue/:id/resolve', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }
  const jobId = Number(req.params.id);
  const action = req.body?.action;
  if (!Number.isFinite(jobId) || (action !== 'requeue' && action !== 'confirm_printed')) {
    return res.status(400).json({ error: 'Invalid job id or action' });
  }
  const job = await resolveJobReview(user.id, jobId, action);
  if (!job) {
    return res.status(404).json({ error: 'Review job not found for this tenant' });
  }
  res.json({ ok: true, job });
});

// Generate a short-lived pairing code for `labelgo-agent --setup`.
router.post('/pairing-code', requirePlanFeature('auto_print'), async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await getUserById(req.session.userId!);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }
  // 8-char code, unambiguous alphabet (no 0/O, 1/I/L).
  const code = crypto.randomBytes(6).toString('hex').slice(0, 8).toUpperCase()
    .replace(/0/g, '2').replace(/1/g, '7');
  const row = await createPairingCode(user.id, code, 30);
  res.json({ code: row.code, expiresAt: row.expires_at });
});

// ---------------------------------------------------------------------------
// Routes protected by agent token (local agent, no browser session)
// ---------------------------------------------------------------------------

function requireAgentToken(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing agent token' });
  }
  const token = auth.slice(7);
  // Validate async by attaching to request
  (async () => {
    const config = await getAutoPrintConfigByAgentToken(token);
    if (!config) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }
    // Entitlement: a lapsed/expired subscription means no new Pro work.
    // Cancelled subs keep access until current_period_end (checked inside
    // hasProAccess).
    if (!(await hasProAccess(config.user_id))) {
      const subs = await pool.query(
        `SELECT "status", "plan_id", "trial_ends_at", "current_period_end" FROM "subscriptions"
         WHERE "user_id" = $1 ORDER BY "created_at" DESC LIMIT 3`,
        [config.user_id]
      );
      console.warn(`[agent-auth] 403 subscription_required user=${config.user_id} subs=${JSON.stringify(subs.rows)}`);
      return res.status(403).json({ error: 'subscription_required' });
    }
    (req as any).agentConfig = config;
    next();
  })().catch(() => res.status(500).json({ error: 'Auth error' }));
}

// Agent heartbeat — keeps the agent marked online
router.post('/heartbeat', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  const agentId = (req.body?.agentId as string | undefined)?.slice(0, 255) || `agent-${config.user_id}`;
  await updateAgentHeartbeat(agentId, config.user_id);
  res.json({ ok: true });
});

// Agent claims pending jobs (atomic, prevents double-print by two agents)
router.post('/queue/claim', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  const limit = Math.min(Number(req.body?.limit) || 5, 20);
  const agentId = (req.body?.agentId as string | undefined)?.slice(0, 255) || `agent-${config.user_id}`;
  const jobs = await claimPrintJobs(config.user_id, agentId, limit);
  res.json({ jobs });
});

// Backwards-compatible GET /queue (returns pending without claiming — for old agents)
router.get('/queue', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  // Use claimPrintJobs with limit to ensure atomic claiming even on old agents
  const limit = Math.min(Number(req.query.limit) || 20, 20);
  const agentId = `legacy-${config.user_id}`;
  const jobs = await claimPrintJobs(config.user_id, agentId, limit);
  res.json({ jobs });
});

// Agent confirms a job it already sent to the printer. `sentToPrinterAt` is
// the agent's local timestamp for when the spooler accepted the job — it may
// be well in the past when the confirmation is retried after a network drop.
router.post('/queue/:id/printed', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }
  const rawSent = req.body?.sentToPrinterAt;
  const sentAt = rawSent ? new Date(rawSent) : undefined;
  const ok = await markPrintJobPrinted(
    config.user_id,
    jobId,
    sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : undefined
  );
  if (!ok) {
    return res.status(404).json({ error: 'Job not found for this tenant' });
  }

  // Funnel event: first confirmed label for this account.
  const stats = await getPrintQueueStats(config.user_id);
  if (Number(stats.printed) === 1) {
    await trackEvent({ event_name: 'first_label_printed', user_id: config.user_id });
  }

  res.json({ ok: true });
});

// Agent marks a job as failed
router.post('/queue/:id/failed', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }
  const error = (req.body?.error as string)?.slice(0, 500) || 'Unknown error';
  const ok = await markPrintJobFailed(config.user_id, jobId, error);
  if (!ok) {
    return res.status(404).json({ error: 'Job not found for this tenant' });
  }
  res.json({ ok: true });
});

export default router;
