import { Router, Request, Response } from 'express';
import { trackEvent, captureUTM } from '../services/analytics.js';
import { normalizeRefCode, recordPartnerClick } from '../services/partners.js';

const router = Router();

/**
 * POST /api/analytics/track — record a first-party analytics event.
 * Body: { event: string, properties?: object }
 * Visitor key is read from x-visitor-key header or body.
 * No tokens/secrets should be sent in properties (enforced by caller).
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { event, properties } = req.body || {};
    if (!event || typeof event !== 'string') {
      return res.status(400).json({ error: 'event is required' });
    }
    if (event.length > 100) {
      return res.status(400).json({ error: 'event name too long' });
    }

    const visitorKey = (req.header('x-visitor-key') as string) || req.body?.visitor_key || '';
    const sessionId = (req.session as any)?.id || '';

    await trackEvent({
      event_name: event,
      user_id: req.session?.userId,
      visitor_key: visitorKey || undefined,
      session_id: sessionId || undefined,
      properties: properties || {},
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Analytics track error:', error);
    res.status(500).json({ error: 'Failed to track' });
  }
});

/**
 * POST /api/analytics/utm — capture UTM params on landing.
 * Body: { utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path }
 */
router.post('/utm', async (req: Request, res: Response) => {
  try {
    const visitorKey = (req.header('x-visitor-key') as string) || req.body?.visitor_key || '';
    if (!visitorKey) {
      return res.status(400).json({ error: 'visitor_key is required' });
    }

    await captureUTM(visitorKey, {
      utm_source: req.body?.utm_source,
      utm_medium: req.body?.utm_medium,
      utm_campaign: req.body?.utm_campaign,
      utm_content: req.body?.utm_content,
      utm_term: req.body?.utm_term,
      referrer: req.body?.referrer,
      landing_path: req.body?.landing_path,
    }, req.session?.userId);

    // Remember the visitor key on the session so the OAuth callback (which
    // receives no x-visitor-key header) can still link a new account to the
    // attribution captured on landing.
    if (req.session) req.session.visitorKey = visitorKey;

    // Partner link (?ref=code): remember the click for signup attribution.
    const refCode = normalizeRefCode(req.body?.ref);
    if (refCode) await recordPartnerClick(visitorKey, refCode);

    res.json({ ok: true });
  } catch (error) {
    console.error('UTM capture error:', error);
    res.status(500).json({ error: 'Failed to capture UTM' });
  }
});

export default router;
