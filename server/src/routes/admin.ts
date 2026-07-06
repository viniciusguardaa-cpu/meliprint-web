import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { getAllSubscribers, getAdminStats } from '../db.js';

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

export default router;
