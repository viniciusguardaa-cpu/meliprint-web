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
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;

    const buildFromShipmentIds = async (shipmentIds: number[]): Promise<ShipmentWithOrder[]> => {
      const uniqueIds = [...new Set(shipmentIds)];
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

    const allShipmentIds = new Set<number>();

    // Source 1: shipments/search API
    try {
      const [readyIds, printedIds, reprintedIds] = await Promise.all([
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'ready_to_print'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'printed'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'reprinted')
      ]);
      for (const id of [...readyIds, ...printedIds, ...reprintedIds]) allShipmentIds.add(id);
      console.log(`[shipments] search API returned ${allShipmentIds.size} unique IDs`);
    } catch (error) {
      console.error('[shipments] search API failed:', error);
    }

    // Source 2: orders/search API (always run to catch anything search missed)
    try {
      const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
      const orderShipmentIds = orders
        .filter(order => order.shipping?.id)
        .map(order => order.shipping.id);
      const beforeCount = allShipmentIds.size;
      for (const id of orderShipmentIds) allShipmentIds.add(id);
      console.log(`[shipments] orders scan added ${allShipmentIds.size - beforeCount} new IDs (total: ${allShipmentIds.size})`);
    } catch (error) {
      console.error('[shipments] orders scan failed:', error);
    }

    // Build shipment details from all collected IDs
    const allRows = await buildFromShipmentIds([...allShipmentIds]);
    console.log(`[shipments] built ${allRows.length} rows, printable: ${allRows.filter(r => r.canPrint).length}`);

    let ready = allRows.filter((s) => s.canPrint && s.substatus === 'ready_to_print');
    let reprint = allRows.filter((s) => s.canPrint && (s.substatus === 'printed' || s.substatus === 'reprinted'));

    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
