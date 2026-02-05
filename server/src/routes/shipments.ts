import { Router, Request, Response } from 'express';
import { getOrders, getShipment } from '../services/mercadolivre.js';

const router = Router();

interface ShipmentWithOrder {
  shipmentId: number;
  orderId: number;
  buyerNickname: string;
  items: string;
  status: string;
  substatus: string;
  canPrint: boolean;
  city?: string;
  state?: string;
}

router.get('/', async (req: Request, res: Response) => {
  if (!req.session.accessToken || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const orders = await getOrders(req.session.accessToken, req.session.userId);
    
    const shipmentsPromises = orders
      .filter(order => order.shipping?.id)
      .map(async (order): Promise<ShipmentWithOrder | null> => {
        try {
          const shipment = await getShipment(req.session.accessToken!, order.shipping.id);
          
          const items = order.order_items
            .map(item => `${item.quantity}x ${item.item.title}`)
            .join(', ');

          // Etiqueta pode ser impressa se status é ready_to_ship OU se substatus indica que está pronta
          const canPrint = shipment.status === 'ready_to_ship' || 
                          shipment.substatus === 'ready_to_print' ||
                          shipment.substatus === 'printed' ||
                          shipment.substatus === 'buffered' ||
                          shipment.substatus === 'invoice_pending';

          return {
            shipmentId: shipment.id,
            orderId: order.id,
            buyerNickname: order.buyer.nickname,
            items: items.length > 100 ? items.substring(0, 97) + '...' : items,
            status: shipment.status,
            substatus: shipment.substatus,
            canPrint,
            city: shipment.receiver_address?.city?.name,
            state: shipment.receiver_address?.state?.name
          };
        } catch (error) {
          console.error(`Failed to get shipment ${order.shipping.id}:`, error);
          return null;
        }
      });

    const shipments = (await Promise.all(shipmentsPromises)).filter(Boolean) as ShipmentWithOrder[];
    
    res.json({ shipments });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
