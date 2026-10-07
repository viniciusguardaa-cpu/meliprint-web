/** Check a persisted checkout against today's offer before returning its URL.
 * Price ids alone are insufficient: the catalog has one row per plan/period.
 * Do not cancel or reprice a stored checkout/preapproval on a mismatch.
 */
export function checkoutMatchesOffer(
  session: { plan_id: string; amount: string | number; currency: string },
  planId: string,
  amount: number,
  currency: string,
): boolean {
  const stored = Number(session.amount);
  return session.plan_id === planId && session.currency === currency
    && Number.isFinite(stored) && Number.isFinite(amount)
    && Math.round(stored * 100) === Math.round(amount * 100);
}
