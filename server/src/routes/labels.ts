import { Router, Request, Response } from 'express';
import { getShipmentLabelsPDF, getShipmentLabelsZPL, getInvoiceData } from '../services/mercadolivre.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getUserByMlId, recordPrintEvents } from '../db.js';

const router = Router();
router.use(requireActiveSubscription);

router.post('/zpl', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;

  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const zpl = await getShipmentLabelsZPL(req.session.accessToken, shipmentIds);
    
    res.setHeader('Content-Type', 'application/x-zpl');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${Date.now()}.zpl"`);
    res.send(zpl);
  } catch (error) {
    console.error('Failed to get labels:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

router.get('/pdf', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const raw = (req.query.shipment_ids || req.query.shipmentIds || '') as string;
  const shipmentIds = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipment_ids must be a non-empty comma separated list' });
  }

  try {
    console.log(`[labels/pdf GET] Generating PDF for ${shipmentIds.length} shipments: ${shipmentIds.join(',')}`);
    const pdf = await getShipmentLabelsPDF(req.session.accessToken, shipmentIds);
    console.log(`[labels/pdf GET] PDF generated successfully, size: ${pdf.length} bytes`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="labels.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (error) {
    console.error('[labels/pdf GET] Failed to get labels pdf:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to generate labels', details: errorMessage });
  }
});

router.post('/pdf', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;

  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const pdf = await getShipmentLabelsPDF(req.session.accessToken, shipmentIds);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="labels.pdf"');
    res.send(pdf);
  } catch (error) {
    console.error('Failed to get labels pdf:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

// Record that the user printed a batch of labels via the browser.
// Feeds the Pro print-history tab. Best-effort: logging failure must not
// block printing.
router.post('/print-log', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0 || shipmentIds.length > 200) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array (max 200)' });
  }
  const ids = shipmentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);

  try {
    const user = await getUserByMlId(req.session.userId);
    if (!user) {
      return res.status(403).json({ error: 'subscription_required' });
    }
    await recordPrintEvents(user.id, ids, 'browser');
    res.json({ ok: true, recorded: ids.length });
  } catch (error) {
    console.error('Failed to record print events:', error);
    res.status(500).json({ error: 'Failed to record print events' });
  }
});

router.post('/invoices', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;

  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const invoicesPromises = shipmentIds.map(async (id) => {
      const data = await getInvoiceData(req.session.accessToken!, id);
      return { shipmentId: id, invoice: data };
    });

    const invoices = await Promise.all(invoicesPromises);
    res.json({ invoices });
  } catch (error) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

export default router;
