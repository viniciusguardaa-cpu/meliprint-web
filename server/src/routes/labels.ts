import { Router, Request, Response } from 'express';
import { getShipmentLabelsZPL, getInvoiceData } from '../services/mercadolivre.js';

const router = Router();

router.post('/zpl', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;

  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  if (shipmentIds.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 shipments per request' });
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
