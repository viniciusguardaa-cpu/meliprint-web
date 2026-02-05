import { Router, Request, Response } from 'express';
import { getOrder, getOrders, getShipment, searchShipments } from '../services/mercadolivre.js';

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
    const accessToken = req.session.accessToken;
    const sellerId = req.session.userId;

    const buildFromShipmentIds = async (shipmentIds: number[]): Promise<ShipmentWithOrder[]> => {
      const uniqueIds = [...new Set(shipmentIds)].slice(0, 100);
      const rows = await Promise.all(
        uniqueIds.map(async (shipmentId): Promise<ShipmentWithOrder | null> => {
          try {
            const shipment = await getShipment(accessToken!, shipmentId);
            const order = await getOrder(accessToken!, shipment.order_id);

            const items = order.order_items
              .map(item => `${item.quantity}x ${item.item.title}`)
              .join(', ');

            const substatus = shipment.substatus;
            const canPrint =
              shipment.status === 'ready_to_ship' &&
              (substatus === 'ready_to_print' || substatus === 'printed' || substatus === 'reprinted');

            return {
              shipmentId: shipment.id,
              orderId: order.id,
              buyerNickname: order.buyer.nickname,
              items: items.length > 100 ? items.substring(0, 97) + '...' : items,
              status: shipment.status,
              substatus,
              canPrint,
              city: shipment.receiver_address?.city?.name,
              state: shipment.receiver_address?.state?.name
            };
          } catch (error) {
            console.error(`Failed to build shipment ${shipmentId}:`, error);
            return null;
          }
        })
      );

      return rows.filter(Boolean) as ShipmentWithOrder[];
    };

    let ready: ShipmentWithOrder[] = [];
    let reprint: ShipmentWithOrder[] = [];

    try {
      const [readyIds, printedIds, reprintedIds] = await Promise.all([
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'ready_to_print'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'printed'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'reprinted')
      ]);

      const rows = await buildFromShipmentIds([...readyIds, ...printedIds, ...reprintedIds]);
      ready = rows.filter((s) => s.substatus === 'ready_to_print');
      reprint = rows.filter((s) => s.substatus === 'printed' || s.substatus === 'reprinted');
    } catch (error) {
      console.error('Shipments search failed, falling back to orders scan:', error);
    }

    if (ready.length === 0 && reprint.length === 0) {
      const orders = await getOrders(accessToken, sellerId);

      const shipmentsPromises = orders
        .filter(order => order.shipping?.id)
        .map(async (order): Promise<ShipmentWithOrder | null> => {
          try {
            const shipment = await getShipment(accessToken!, order.shipping.id);

            const items = order.order_items
              .map(item => `${item.quantity}x ${item.item.title}`)
              .join(', ');

            const substatus = shipment.substatus;
            const canPrint =
              shipment.status === 'ready_to_ship' &&
              (substatus === 'ready_to_print' || substatus === 'printed' || substatus === 'reprinted');

            return {
              shipmentId: shipment.id,
              orderId: order.id,
              buyerNickname: order.buyer.nickname,
              items: items.length > 100 ? items.substring(0, 97) + '...' : items,
              status: shipment.status,
              substatus,
              canPrint,
              city: shipment.receiver_address?.city?.name,
              state: shipment.receiver_address?.state?.name
            };
          } catch (error) {
            console.error(`Failed to get shipment ${order.shipping.id}:`, error);
            return null;
          }
        });

      const rows = (await Promise.all(shipmentsPromises)).filter(Boolean) as ShipmentWithOrder[];

      ready = rows.filter((s) => s.substatus === 'ready_to_print');
      reprint = rows.filter((s) => s.substatus === 'printed' || s.substatus === 'reprinted');
    }

    ready = ready.filter((s) => s.canPrint);
    reprint = reprint.filter((s) => s.canPrint);

    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
