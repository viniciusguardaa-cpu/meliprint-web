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

const PRINTABLE_SUBSTATUSES = new Set([
  'ready_to_print',
  'printed',
  'reprinted',
  'stale',
  'ready_to_deliver',
]);

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    for (const r of batchResults) {
      if (r !== null) results.push(r);
    }
  }
  return results;
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

    const allShipmentIds = new Set<number>();

    // Source 1: shipments/search API (no date filter, catches all active shipments)
    try {
      const [readyIds, printedIds, reprintedIds] = await Promise.all([
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'ready_to_print'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'printed'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'reprinted')
      ]);
      for (const id of [...readyIds, ...printedIds, ...reprintedIds]) allShipmentIds.add(id);
      console.log(`[shipments] search API: ready_to_print=${readyIds.length} printed=${printedIds.length} reprinted=${reprintedIds.length} total=${allShipmentIds.size}`);
    } catch (error) {
      console.error('[shipments] search API failed:', error);
    }

    // Source 2: orders/search API (with date filter, always run)
    try {
      const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
      const orderShipmentIds = orders
        .filter(order => order.shipping?.id)
        .map(order => order.shipping.id);
      const beforeCount = allShipmentIds.size;
      for (const id of orderShipmentIds) allShipmentIds.add(id);
      console.log(`[shipments] orders scan: ${orders.length} orders, added ${allShipmentIds.size - beforeCount} new IDs (total: ${allShipmentIds.size})`);
    } catch (error) {
      console.error('[shipments] orders scan failed:', error);
    }

    console.log(`[shipments] resolving ${allShipmentIds.size} shipment IDs...`);

    // Build shipment details in controlled batches of 10 to avoid ML rate limiting
    const allRows = await processBatch(
      [...allShipmentIds],
      10,
      async (shipmentId): Promise<ShipmentWithOrder | null> => {
        try {
          const shipment = await getShipment(accessToken!, shipmentId);
          const order = await getOrder(accessToken!, shipment.order_id);

          const items = order.order_items
            .map(item => `${item.quantity}x ${item.item.title}`)
            .join(', ');

          const substatus = shipment.substatus || '';
          const canPrint =
            shipment.status === 'ready_to_ship' &&
            PRINTABLE_SUBSTATUSES.has(substatus);

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
        } catch (error: any) {
          console.error(`[shipments] FAILED shipment ${shipmentId}: ${error.message || error}`);
          return null;
        }
      }
    );

    // Log all status/substatus combinations for debugging
    const statusMap: Record<string, number> = {};
    for (const row of allRows) {
      const key = `${row.status}/${row.substatus}`;
      statusMap[key] = (statusMap[key] || 0) + 1;
    }
    console.log(`[shipments] status breakdown:`, statusMap);
    console.log(`[shipments] total=${allRows.length} printable=${allRows.filter(r => r.canPrint).length} failed=${allShipmentIds.size - allRows.length}`);

    const ready = allRows.filter((s) => s.canPrint && s.substatus === 'ready_to_print');
    const reprint = allRows.filter((s) => s.canPrint && s.substatus !== 'ready_to_print');

    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
