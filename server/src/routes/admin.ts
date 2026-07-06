import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  getAllSubscribers,
  getAdminStats,
  getFreeAccessList,
  addFreeAccess,
  removeFreeAccess
} from '../db.js';

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
    res.json({
      totalUsers: Number(stats.total_users),
      activeSubscriptions: Number(stats.active_subscriptions),
      mrr: Number(stats.mrr),
      cancelledSubscriptions: Number(stats.cancelled_subscriptions)
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
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
