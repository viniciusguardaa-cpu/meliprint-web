import { Router, Request, Response } from 'express';
import { trackEvent } from '../services/analytics.js';

const router = Router();

/**
 * POST /api/tools/zpl-to-pdf — free ZPL to PDF converter (no login required).
 * Uses Labelary API (same as the authenticated label endpoint).
 * Body: { zpl: string }
 */
router.post('/zpl-to-pdf', async (req: Request, res: Response) => {
  const zpl = req.body?.zpl as string | undefined;
  if (!zpl || typeof zpl !== 'string') {
    return res.status(400).json({ error: 'ZPL content is required' });
  }
  if (zpl.length > 100_000) {
    return res.status(400).json({ error: 'ZPL content too large (max 100KB)' });
  }

  const visitorKey = (req.header('x-visitor-key') as string) || '';

  try {
    const response = await fetch('http://api.labelary.com/v1/printers/0/8/4/8', {
      method: 'POST',
      headers: { 'Accept': 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: zpl,
    });

    if (!response.ok) {
      throw new Error(`Labelary error: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Track tool usage (no PII)
    await trackEvent({
      event_name: 'zpl_to_pdf_tool_used',
      visitor_key: visitorKey || undefined,
      properties: { zpl_length: zpl.length },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="labelgo-label.pdf"');
    res.send(buffer);
  } catch (error) {
    console.error('ZPL to PDF conversion error:', error);
    res.status(500).json({ error: 'Failed to convert ZPL to PDF' });
  }
});

export default router;
