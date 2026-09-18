import { Router, Request, Response } from 'express';
import { getProvider } from '../providers/index.js';
import type { NormalizedShipment } from '../providers/types.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getPlan } from '../services/pricing.js';
import { getMarketplaceAccountsForUser, getPrintEvents } from '../db.js';

const router = Router();
router.use(requireActiveSubscription);

router.get('/', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const userId = req.session.userId;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;
    const providerFilter = req.query.provider as string | undefined;

    // Pro-only fields are gated server-side: Start plans never receive them.
    const planId = (req as any).planId as string | undefined;
    const plan = planId ? await getPlan(planId) : null;
    const showSla = plan?.sla_queue === true;
    const showPacking = plan?.packing_check === true;

    // Resolve connected marketplace accounts (optionally filtered by provider).
    const accounts = (await getMarketplaceAccountsForUser(userId))
      .filter((a: any) => !providerFilter || a.provider === providerFilter);

    // Accounts whose OAuth grant died (refresh token revoked/missing) can't
    // be fetched — the UI surfaces them as a reconnect banner instead of a
    // silently empty label list.
    const needsReauth = accounts
      .filter((a: any) => a.status === 'reauth_required')
      .map((a: any) => ({ accountId: a.id, provider: a.provider, nickname: a.nickname }));
    const fetchable = accounts.filter((a: any) => a.status !== 'reauth_required');

    if (fetchable.length === 0) {
      return res.json({ ready: [], reprint: [], needsReauth });
    }

    // Fetch each account's shipments through its provider; failures in one
    // marketplace don't take down the others.
    const rows: NormalizedShipment[] = [];
    await Promise.all(fetchable.map(async (account: any) => {
      const provider = getProvider(account.provider);
      if (!provider) {
        console.error(`[shipments] Unknown provider: ${account.provider}`);
        return;
      }
      const ctx = await getFreshAccountContext(account);
      if (!ctx) {
        console.error(`[shipments] Could not get token for account ${account.id} (${account.provider})`);
        return;
      }
      try {
        const accountRows = await provider.listReadyShipments(ctx, {
          dateFrom,
          dateTo,
          includeSla: showSla,
          includePacking: showPacking
        });
        rows.push(...accountRows);
      } catch (error) {
        console.error(`[shipments] ${account.provider} account ${account.id} failed:`, error);
      }
    }));

    const ready = rows.filter((s) => s.substatus === 'ready_to_print');
    const reprint = rows.filter((s) => s.substatus !== 'ready_to_print');

    // Pro SLA queue: most urgent dispatch first — earliest deadline on top,
    // shipments without deadline data go last.
    if (showSla) {
      const byDeadline = (a: NormalizedShipment, b: NormalizedShipment) => {
        if (!a.dispatchDeadline && !b.dispatchDeadline) return 0;
        if (!a.dispatchDeadline) return 1;
        if (!b.dispatchDeadline) return -1;
        return a.dispatchDeadline.localeCompare(b.dispatchDeadline);
      };
      ready.sort(byDeadline);
      reprint.sort(byDeadline);
    }

    console.log(`[shipments] accounts=${fetchable.length} reauth=${needsReauth.length} ready=${ready.length} reprint=${reprint.length}`);
    res.json({ ready, reprint, needsReauth });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

// Pro (print_history): recent labels this account printed via the browser.
// Agent-driven prints are tracked separately in print_queue.
router.get('/print-history', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const planId = (req as any).planId as string | undefined;
  const plan = planId ? await getPlan(planId) : null;
  if (plan?.print_history !== true) {
    return res.status(403).json({
      error: 'plan_upgrade_required',
      message: 'Histórico de impressões disponível no plano Pro.'
    });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await getPrintEvents(req.session.userId, limit);
  res.json({ events });
});

export default router;
