import {
  getShipmentList,
  getOrderDetail,
  getShippingParameter,
  requestDocumentCreation,
  arrangeShipment,
  hasValidInvoice,
  ShippingParameter,
  ShopeeOrderDetail
} from './shopee.js';
import { claimArrangeAttempt, finishArrangeAttempt, getRecentlyArrangedPackages } from '../db.js';

/**
 * Opt-in automatic "organizar envio" for Shopee.
 *
 * Safety rules (all must hold, otherwise the package is skipped, never guessed):
 *  - account has auto_arrange_shipment = true (default false)
 *  - order is READY_TO_SHIP, with a valid NF (same strict rule as label readiness)
 *  - every package has a package_number
 *  - Shopee's get_shipping_parameter offers the method the seller chose
 *    (pickup or dropoff) and everything it asks for can be filled without guessing
 *  - the package is claimed in shipment_arrange_log BEFORE ship_order, so it is
 *    never sent twice (uncertain outcomes are never retried automatically)
 *  - at most MAX_PER_CYCLE packages per poll
 */

export type ArrangeMethod = 'pickup' | 'dropoff';
const MAX_PER_CYCLE = 10;

type Shop = { accessToken: string; shopId: string };
type Plan = { body: Record<string, unknown> } | { skip: string };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Pure decision: build the ship_order payload from Shopee's parameters, or explain the skip. */
export function planArrange(orderSn: string, packageNumber: string | undefined, param: ShippingParameter, method: ArrangeMethod): Plan {
  const needed = param.info_needed || {};
  // Shopee rejects package_number for unsplit orders (ship_order_not_need_pacakge_number).
  const base: Record<string, unknown> = packageNumber ? { order_sn: orderSn, package_number: packageNumber } : { order_sn: orderSn };

  if (needed.non_integrated && !needed.pickup && !needed.dropoff) return { skip: 'canal não integrado' };

  if (method === 'pickup') {
    if (!needed.pickup) return { skip: 'coleta não disponível para este pedido' };
    if (needed.pickup.some(f => f !== 'address_id' && f !== 'pickup_time_id')) return { skip: `coleta exige ${needed.pickup.join(',')}` };
    const pickup: Record<string, unknown> = {};
    if (needed.pickup.includes('address_id')) {
      const list = param.pickup?.address_list || [];
      const flagged = list.filter(a => a.address_flag?.includes('pickup_address'));
      const defaults = list.filter(a => a.address_flag?.includes('default_address'));
      const pick = flagged.length === 1 ? flagged[0] : flagged.length === 0 && defaults.length === 1 ? defaults[0] : list.length === 1 ? list[0] : null;
      if (!pick) return { skip: 'endereço de coleta ambíguo' };
      pickup.address_id = pick.address_id;
      if (needed.pickup.includes('pickup_time_id')) {
        const slots = pick.time_slot_list || [];
        if (slots.length > 0) {
          const slot = slots.find(s => s.flags?.includes('recommended'));
          if (!slot) return { skip: 'sem horário de coleta recomendado' };
          pickup.pickup_time_id = slot.pickup_time_id;
        }
      }
    }
    return { body: { ...base, pickup } };
  }

  if (!needed.dropoff) return { skip: 'agência/dropoff não disponível para este pedido' };
  if (needed.dropoff.some(f => f !== 'branch_id')) return { skip: `dropoff exige ${needed.dropoff.join(',')}` };
  const dropoff: Record<string, unknown> = {};
  if (needed.dropoff.includes('branch_id')) {
    const branches = param.dropoff?.branch_list || [];
    if (branches.length !== 1) return { skip: 'agência de dropoff ambígua' };
    dropoff.branch_id = branches[0].branch_id;
  }
  return { body: { ...base, dropoff } };
}

export function isEligibleOrder(order: ShopeeOrderDetail): boolean {
  if (order.order_status !== 'READY_TO_SHIP') return false;
  if (!hasValidInvoice(order)) return false;
  const pkgs = order.package_list || [];
  return pkgs.length > 0 && pkgs.every(p => !!p.package_number);
}

export interface ArrangeSummary { arranged: number; skipped: number; failed: number }

/** For orders we arranged: request the label document so Shopee reports it READY on a later poll. */
export async function ensureDocumentsForArranged(accountId: number, shop: Shop): Promise<void> {
  const rows = await getRecentlyArrangedPackages(accountId);
  for (const row of rows.slice(0, 20)) {
    await requestDocumentCreation(shop, row.order_sn, row.package_number || undefined);
    await sleep(300);
  }
}

export async function arrangeReadyShipments(accountId: number, shop: Shop, method: ArrangeMethod): Promise<ArrangeSummary> {
  const summary: ArrangeSummary = { arranged: 0, skipped: 0, failed: 0 };
  const entries = await getShipmentList(shop, 100);
  const sns = [...new Set(entries.map(e => e.order_sn))];
  if (sns.length === 0) return summary;
  const details = await getOrderDetail(shop, sns);
  let sent = 0;
  for (const order of details) {
    if (!isEligibleOrder(order)) { summary.skipped++; continue; }
    for (const pkg of order.package_list!) {
      if (sent >= MAX_PER_CYCLE) return summary;
      const packageNumber = pkg.package_number;
      // Single-package (unsplit) orders: ship_order must be sent without package_number.
      const shipPackage = order.package_list!.length > 1 ? packageNumber : undefined;
      let plan: Plan;
      try {
        plan = planArrange(order.order_sn, shipPackage, await getShippingParameter(shop, order.order_sn, packageNumber), method);
      } catch (error) {
        console.warn(`[shopeeArrange] get_shipping_parameter failed for ${order.order_sn}:`, error instanceof Error ? error.message : error);
        summary.skipped++;
        continue;
      }
      if ('skip' in plan) {
        console.log(`[shopeeArrange] skip ${order.order_sn}/${packageNumber}: ${plan.skip}`);
        summary.skipped++;
        continue;
      }
      if (!(await claimArrangeAttempt(accountId, order.order_sn, packageNumber, method))) { summary.skipped++; continue; }
      sent++;
      try {
        await arrangeShipment(shop, plan.body);
        await finishArrangeAttempt(accountId, order.order_sn, packageNumber, 'requested');
        summary.arranged++;
        console.log(`[shopeeArrange] arranged ${order.order_sn}/${packageNumber} via ${method}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Only a Shopee JSON error answer proves nothing was arranged; network
        // errors/timeouts leave the row 'claimed' (uncertain, never retried).
        if (/^Shopee \/api\/v2\/logistics\/ship_order failed:/.test(msg)) {
          await finishArrangeAttempt(accountId, order.order_sn, packageNumber, 'failed', msg);
        }
        summary.failed++;
        console.error(`[shopeeArrange] ship_order failed for ${order.order_sn}/${packageNumber}: ${msg}`);
      }
      await sleep(300);
    }
  }
  return summary;
}
