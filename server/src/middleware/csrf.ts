import { Request, Response, NextFunction } from 'express';

function isFrontendOrigin(value: string): boolean {
  try {
    return value === new URL(process.env.FRONTEND_URL || 'http://localhost:5173').origin;
  } catch { return false; }
}

/** Browser mutations must originate from our frontend; webhooks/agents have no cookies. */
export function rejectCrossSiteRequests(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.header('origin');
  if (origin) {
    if (isFrontendOrigin(origin)) return next();
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  const site = req.header('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') {
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  // Referrer covers older browsers that do not send Origin / Fetch Metadata.
  const referer = req.header('referer');
  if (referer) {
    try {
      if (isFrontendOrigin(new URL(referer).origin)) return next();
    } catch { /* invalid referrer */ }
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  if (site === 'same-origin') return next();
  // Browser cookies without any origin evidence cannot authorize mutations.
  if (req.header('cookie')) return res.status(403).json({ error: 'forbidden_origin' });
  next();
}
