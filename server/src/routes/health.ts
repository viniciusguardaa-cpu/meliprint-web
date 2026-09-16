import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

// Liveness probe — process is up and can respond.
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — process can serve traffic (DB reachable).
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query('SELECT 1');
    }
    res.json({ status: 'ready', db: process.env.DATABASE_URL ? 'ok' : 'not_configured' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', db: 'error', error: err instanceof Error ? err.message : 'unknown' });
  }
});

export default router;
