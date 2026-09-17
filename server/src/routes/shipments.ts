import { Router, Request, Response } from 'express';
import { getOrders, getShipment, searchShipments, Order, Shipment } from '../services/mercadolivre.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getPlan } from '../services/pricing.js';
import { getUserByMlId, getPrintEvents } from '../db.js';

const router = Router();
router.use(requireActiveSubscription);

interface OrderItem {
  title: string;
  quantity: number;
  sku?: string;
}

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
  /** Pro (sla_queue): dispatch deadline from ML lead_time.buffering. */
  dispatchDeadline?: string;
  /** Pro (packing_check): structured items for pre-print confirmation. */
  orderItems?: OrderItem[];
}

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 50;

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

    // Pro-only fields are gated server-side: Start plans never receive them.
    const planId = (req as any).planId as string | undefined;
    const plan = planId ? await getPlan(planId) : null;
    const showSla = plan?.sla_queue === true;
    const showPacking = plan?.packing_check === true;

    // Step 1: Source of truth - all ready_to_ship shipments
    const searchIds = new Set<number>();
    try {
      const readyToShipIds = await searchShipments(accessToken, sellerId, 'ready_to_ship');
      for (const id of readyToShipIds) searchIds.add(id);
      console.log(`[shipments] search API: ready_to_ship total=${searchIds.size}`);
    } catch (error) {
      console.error('[shipments] search API failed:', error);
    }

    // Step 2: Always fetch orders to build shipping_id → order map.
    // As of Oct 2025, ML discontinued order_id/external_reference from shipment
    // responses, so we can no longer get the order_id from a shipment. Instead,
    // we fetch orders (which still contain shipping.id) and match by shipment ID.
    const ordersByShipmentId = new Map<number, Order>();
    try {
      const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
      for (const order of orders) {
        if (order.shipping?.id) {
          ordersByShipmentId.set(order.shipping.id, order);
          // Also add to shipment IDs as fallback (helps if search returns empty)
          if (!searchIds.has(order.shipping.id)) {
            searchIds.add(order.shipping.id);
          }
        }
      }
      console.log(`[shipments] orders scan: ${orders.length} orders, ${ordersByShipmentId.size} mapped to shipments`);
    } catch (error) {
      console.error('[shipments] orders scan failed:', error);
    }

    const allShipmentIds = Array.from(searchIds);
    console.log(`[shipments] total unique IDs to resolve: ${allShipmentIds.length}`);

    // Step 3: Resolve shipments
    const failedShipmentIds: number[] = [];
    const shipments = await processBatchWithDelay(
      allShipmentIds,
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

    // Step 4: Build rows using the shipping_id → order map (no order_id from shipment)
    let rows: ShipmentWithOrder[] = shipments.map((shipment) => {
      const order = ordersByShipmentId.get(shipment.id);
      const items = order
        ? order.order_items.map(item => `${item.quantity}x ${item.item.title}`).join(', ')
        : '';

      const row: ShipmentWithOrder = {
        shipmentId: shipment.id,
        orderId: order?.id || 0,
        buyerNickname: order?.buyer?.nickname || '-',
        items: items.length > 100 ? items.substring(0, 97) + '...' : items,
        status: shipment.status,
        substatus: shipment.substatus || '',
        canPrint: shipment.substatus !== 'invoice_pending',
        city: shipment.receiver_address?.city?.name,
        state: shipment.receiver_address?.state?.name
      };

      if (showSla) {
        // ML lead_time.buffering = deadline for the seller to hand the package
        // to the carrier ("despachar até").
        const deadline = shipment.lead_time?.buffering?.date;
        if (deadline) row.dispatchDeadline = deadline;
      }

      if (showPacking && order) {
        row.orderItems = order.order_items.map((item) => ({
          title: item.item.title,
          quantity: item.quantity,
          sku: item.item.seller_sku || undefined
        }));
      }

      return row;
    });

    // Step 5: Optional date filter (based on order.date_created when available)
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const order = ordersByShipmentId.get(r.shipmentId);
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

    // Pro SLA queue: most urgent dispatch first — earliest deadline on top,
    // shipments without deadline data go last.
    if (showSla) {
      const byDeadline = (a: ShipmentWithOrder, b: ShipmentWithOrder) => {
        if (!a.dispatchDeadline && !b.dispatchDeadline) return 0;
        if (!a.dispatchDeadline) return 1;
        if (!b.dispatchDeadline) return -1;
        return a.dispatchDeadline.localeCompare(b.dispatchDeadline);
      };
      ready.sort(byDeadline);
      reprint.sort(byDeadline);
    }

    console.log(`[shipments] ready=${ready.length} reprint=${reprint.length}`);
    res.json({ ready, reprint });
  } catch (error) {
    console.error('Failed to get shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
});

// Pro (print_history): recent labels this account printed via the browser.
// Agent-driven prints are tracked separately in print_queue.
router.get('/print-history', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const planId = (req as any).planId as string | undefined;
  const plan = planId ? await getPlan(planId) : null;
  if (plan?.print_history !== true) {
    return res.status(403).json({
      error: 'plan_upgrade_required',
      message: 'Histórico de impressões disponível no plano Pro.'
    });
  }

  const user = await getUserByMlId(req.session.userId);
  if (!user) {
    return res.status(403).json({ error: 'subscription_required' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await getPrintEvents(user.id, limit);
  res.json({ events });
});

export default router;
