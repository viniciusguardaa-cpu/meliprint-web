import { Router, Request, Response } from 'express';
import { getOrder, getOrders, getShipment, searchShipments, Order } from '../services/mercadolivre.js';

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

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatchWithDelay<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) await sleep(delayMs);
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

    // Step 1: Collect shipment IDs from searchShipments
    const searchIds = new Set<number>();
    try {
      const [readyIds, printedIds, reprintedIds] = await Promise.all([
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'ready_to_print'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'printed'),
        searchShipments(accessToken, sellerId, 'ready_to_ship', 'reprinted')
      ]);
      for (const id of [...readyIds, ...printedIds, ...reprintedIds]) searchIds.add(id);
      console.log(`[shipments] search API: ready_to_print=${readyIds.length} printed=${printedIds.length} reprinted=${reprintedIds.length} total=${searchIds.size}`);
    } catch (error) {
      console.error('[shipments] search API failed:', error);
    }

    // Step 2: Get orders (we already have buyer/items data from these)
    const ordersByShipmentId = new Map<number, Order>();
    try {
      const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
      for (const order of orders) {
        if (order.shipping?.id) {
          ordersByShipmentId.set(order.shipping.id, order);
        }
      }
      console.log(`[shipments] orders scan: ${orders.length} orders, ${ordersByShipmentId.size} with shipping IDs`);
    } catch (error) {
      console.error('[shipments] orders scan failed:', error);
    }

    // Step 3: Merge IDs - searchShipments + orders
    const allShipmentIds = new Set<number>([...searchIds, ...ordersByShipmentId.keys()]);
    console.log(`[shipments] total unique IDs to resolve: ${allShipmentIds.size}`);

    // Step 4: Only fetch getShipment for status/substatus (NOT getOrder again)
    // Process in small batches with delay to avoid ML rate limiting
    const failedIds: number[] = [];

    async function resolveShipment(shipmentId: number): Promise<ShipmentWithOrder | null> {
      const shipment = await getShipment(accessToken!, shipmentId);

      const substatus = shipment.substatus || '';
      const canPrint =
        shipment.status === 'ready_to_ship' &&
        PRINTABLE_SUBSTATUSES.has(substatus);

      // Skip non-printable shipments early (saves getOrder calls)
      if (!canPrint) return null;

      // Use cached order data from getOrders if available, otherwise fetch
      let order = ordersByShipmentId.get(shipmentId);
      if (!order && shipment.order_id) {
        try {
          order = await getOrder(accessToken!, shipment.order_id);
        } catch {
          // If we can't get order details, still show the shipment
        }
      }

      const items = order
        ? order.order_items.map(item => `${item.quantity}x ${item.item.title}`).join(', ')
        : '';

      return {
        shipmentId: shipment.id,
        orderId: order?.id || shipment.order_id || 0,
        buyerNickname: order?.buyer?.nickname || '-',
        items: items.length > 100 ? items.substring(0, 97) + '...' : items,
        status: shipment.status,
        substatus,
        canPrint,
        city: shipment.receiver_address?.city?.name,
        state: shipment.receiver_address?.state?.name
      };
    }

    const allRows = await processBatchWithDelay(
      [...allShipmentIds],
      BATCH_SIZE,
      BATCH_DELAY_MS,
      async (shipmentId): Promise<ShipmentWithOrder | null> => {
        try {
          return await resolveShipment(shipmentId);
        } catch {
          // Retry once after a delay
          try {
            await sleep(500);
            return await resolveShipment(shipmentId);
          } catch (error: any) {
            failedIds.push(shipmentId);
            return null;
          }
        }
      }
    );

    if (failedIds.length > 0) {
      console.error(`[shipments] ${failedIds.length} shipments failed after retry: ${failedIds.join(',')}`);
    }
    console.log(`[shipments] printable=${allRows.length} failed=${failedIds.length} (from ${allShipmentIds.size} total IDs)`);

    const ready = allRows.filter((s) => s.substatus === 'ready_to_print');
    const reprint = allRows.filter((s) => s.substatus !== 'ready_to_print');

    console.log(`[shipments] ready=${ready.length} reprint=${reprint.length}`);
    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
