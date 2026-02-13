import { Router, Request, Response } from 'express';
import { getOrder, getOrders, getShipment, searchShipments, Order, Shipment } from '../services/mercadolivre.js';

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

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isWithinRange(date: Date, from?: string, to?: string): boolean {
  if (from) {
    const df = new Date(from);
    if (!Number.isNaN(df.getTime()) && date < df) return false;
  }
  if (to) {
    const dt = new Date(to);
    if (!Number.isNaN(dt.getTime()) && date > dt) return false;
  }
  return true;
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

    // Step 1: Source of truth - all ready_to_ship shipments
    const searchIds = new Set<number>();
    try {
      const readyToShipIds = await searchShipments(accessToken, sellerId, 'ready_to_ship');
      for (const id of readyToShipIds) searchIds.add(id);
      console.log(`[shipments] search API: ready_to_ship total=${searchIds.size}`);
    } catch (error) {
      console.error('[shipments] search API failed:', error);
    }

    // Step 2: Fallback IDs from orders (helps if search endpoint returns empty)
    const fallbackIds = new Set<number>();
    if (searchIds.size === 0) {
      try {
        const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
        for (const order of orders) {
          if (order.shipping?.id) fallbackIds.add(order.shipping.id);
        }
        console.log(`[shipments] fallback orders scan: ${orders.length} orders, ${fallbackIds.size} shipment IDs`);
      } catch (error) {
        console.error('[shipments] fallback orders scan failed:', error);
      }
    }

    const allShipmentIds = new Set<number>([...searchIds, ...fallbackIds]);
    console.log(`[shipments] total unique IDs to resolve: ${allShipmentIds.size}`);

    // Step 3: Resolve shipments
    const failedShipmentIds: number[] = [];
    const shipments = await processBatchWithDelay(
      [...allShipmentIds],
      BATCH_SIZE,
      BATCH_DELAY_MS,
      async (shipmentId): Promise<Shipment | null> => {
        try {
          const shipment = await getShipment(accessToken, shipmentId);
          if (shipment.status !== 'ready_to_ship') return null;
          return shipment;
        } catch {
          try {
            await sleep(500);
            const shipment = await getShipment(accessToken, shipmentId);
            if (shipment.status !== 'ready_to_ship') return null;
            return shipment;
          } catch {
            failedShipmentIds.push(shipmentId);
            return null;
          }
        }
      }
    );

    if (failedShipmentIds.length > 0) {
      console.error(`[shipments] ${failedShipmentIds.length} shipments failed after retry: ${failedShipmentIds.join(',')}`);
    }

    // Step 4: Fetch orders for resolved shipments
    const orderIds = Array.from(
      new Set(shipments.map((s) => s.order_id).filter((id): id is number => Number.isFinite(id) && id > 0))
    );

    const ordersById = new Map<number, Order>();
    const failedOrderIds: number[] = [];
    await processBatchWithDelay(
      orderIds,
      BATCH_SIZE,
      BATCH_DELAY_MS,
      async (orderId): Promise<null> => {
        try {
          const order = await getOrder(accessToken, orderId);
          ordersById.set(orderId, order);
          return null;
        } catch {
          failedOrderIds.push(orderId);
          return null;
        }
      }
    );

    if (failedOrderIds.length > 0) {
      console.error(`[shipments] ${failedOrderIds.length} orders failed: ${failedOrderIds.slice(0, 20).join(',')}`);
    }

    let rows: ShipmentWithOrder[] = shipments.map((shipment) => {
      const order = ordersById.get(shipment.order_id);
      const items = order
        ? order.order_items.map(item => `${item.quantity}x ${item.item.title}`).join(', ')
        : '';

      return {
        shipmentId: shipment.id,
        orderId: order?.id || shipment.order_id || 0,
        buyerNickname: order?.buyer?.nickname || '-',
        items: items.length > 100 ? items.substring(0, 97) + '...' : items,
        status: shipment.status,
        substatus: shipment.substatus || '',
        canPrint: true,
        city: shipment.receiver_address?.city?.name,
        state: shipment.receiver_address?.state?.name
      };
    });

    // Step 5: Optional date filter (based on order.date_created when available)
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const order = ordersById.get(r.orderId);
        const created = (order as any)?.date_created as string | undefined;
        if (!created) return true;
        const d = new Date(created);
        if (Number.isNaN(d.getTime())) return true;
        return isWithinRange(d, dateFrom, dateTo);
      });
    }

    console.log(`[shipments] ready_to_ship rows=${rows.length} shipments_failed=${failedShipmentIds.length}`);

    const ready = rows.filter((s) => s.substatus === 'ready_to_print');
    const reprint = rows.filter((s) => s.substatus !== 'ready_to_print');

    console.log(`[shipments] ready=${ready.length} reprint=${reprint.length}`);
    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

export default router;
