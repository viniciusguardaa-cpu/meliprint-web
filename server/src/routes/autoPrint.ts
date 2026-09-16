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
  getUserByMlId
} from '../db.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = Router();

// ---------------------------------------------------------------------------
// Routes protected by session (user is logged in via browser)
// ---------------------------------------------------------------------------

// Enable auto-print: copies session ML tokens to DB, generates agent token
router.post('/enable', requireActiveSubscription, async (req: Request, res: Response) => {
  if (!req.session.accessToken || !req.session.refreshToken || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const printerName = (req.body?.printerName as string | undefined)?.trim() || undefined;

  const user = await getUserByMlId(req.session.userId);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  const agentToken = crypto.randomBytes(32).toString('hex');

  const config = await upsertAutoPrintConfig(user.id, {
    enabled: true,
    mlAccessToken: req.session.accessToken,
    mlRefreshToken: req.session.refreshToken,
    mlTokenExpiresAt: req.session.tokenExpiresAt ?? Date.now() + 21600 * 1000,
    mlSellerId: req.session.userId,
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

  const user = await getUserByMlId(req.session.userId);
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

  const user = await getUserByMlId(req.session.userId);
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

  const user = await getUserByMlId(req.session.userId);
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
  const user = await getUserByMlId(req.session.userId);
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

// Agent marks a job as printed
router.post('/queue/:id/printed', requireAgentToken, async (req: Request, res: Response) => {
  const config = (req as any).agentConfig;
  const jobId = Number(req.params.id);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }
  const ok = await markPrintJobPrinted(config.user_id, jobId);
  if (!ok) {
    return res.status(404).json({ error: 'Job not found for this tenant' });
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
