import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  getShipmentList: vi.fn(), getProcessedOrders: vi.fn(), getOrderDetail: vi.fn(), getShippingParameter: vi.fn(),
  requestDocumentCreation: vi.fn(), arrangeShipment: vi.fn(), diagnoseDocument: vi.fn(),
  claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn(), getArrangeAttempts: vi.fn(),
  getArrangeAttemptDetail: vi.fn(), getRecentlyArrangedPackagesAll: vi.fn()
}));
vi.mock('../services/shopee.js', () => ({ ...m, hasValidInvoice: () => true }));
vi.mock('../db.js', () => m);

import { ensureDocumentsForArranged, selectDocTargets, __resetDocProgress, pacing } from '../services/shopeeArrange.js';
const shop = { accessToken: 't', shopId: 's' };
const on = { SHOPEE_FAIR_DOCS_ACCOUNT_IDS: '27' } as any;
const rowsOf = (n: number, startMin = 0) => Array.from({ length: n }, (_, i) => ({
  order_sn: `O${startMin + i}`, package_number: `P${startMin + i}`, updated_at: new Date(Date.UTC(2026, 9, 14, 12, 0) - (startMin + i) * 60_000)
}));
beforeEach(() => { pacing.factor = 0; vi.clearAllMocks(); __resetDocProgress(); vi.useRealTimers(); });

it('legacy path is untouched for accounts not enabled', async () => {
  m.getRecentlyArrangedPackages.mockResolvedValue(rowsOf(30));
  m.requestDocumentCreation.mockResolvedValue('already_ready');
  await ensureDocumentsForArranged(5, shop, on);
  expect(m.getRecentlyArrangedPackagesAll).not.toHaveBeenCalled();
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(20);
});
it('50 packages: 40 old READY + 10 new pending - new ones reached in the FIRST cycle, READY ones stop consuming slots', async () => {
  const rows = [...rowsOf(10, 0), ...rowsOf(40, 100)]; // 10 newest pending, 40 older READY
  m.getRecentlyArrangedPackagesAll.mockResolvedValue(rows);
  const ready = new Set(rows.slice(10).map(r => r.order_sn));
  const created = new Set<string>();
  m.requestDocumentCreation.mockImplementation(async (_s: any, sn: string) => {
    if (ready.has(sn)) return 'already_ready';
    created.add(sn); return 'create_sent_ok';
  });
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 0));
  await ensureDocumentsForArranged(27, shop, on);
  expect([...created].sort()).toEqual(rows.slice(0, 10).map(r => r.order_sn).sort());
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(20); // 10 new + 10 old, batch bound
  // cycles later: all old READY get checked once (batch of 20) and then skipped
  for (let i = 1; i <= 2; i++) { vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 0) + i * 100_000); await ensureDocumentsForArranged(27, shop, on); }
  const calls = m.requestDocumentCreation.mock.calls.map(c => c[1] as string);
  for (const sn of ready) expect(calls.filter(x => x === sn).length).toBe(1); // checked exactly once, no starvation, no repeat
  // pending ones: create sent once, held 5 min (no repeat inside the hold)
  expect(calls.filter(x => created.has(x)).length).toBe(10);
});
it('continuous volume: a package arranged later is picked on the next cycle even with 100 READY rows ahead', async () => {
  const old = rowsOf(100, 200);
  const ready = new Set(old.map(r => r.order_sn));
  m.requestDocumentCreation.mockImplementation(async (_s: any, sn: string) => ready.has(sn) ? 'already_ready' : 'create_sent_ok');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 0));
  m.getRecentlyArrangedPackagesAll.mockResolvedValue(old);
  for (let i = 0; i < 3; i++) { await ensureDocumentsForArranged(27, shop, on); vi.advanceTimersByTime(100_000); }
  m.requestDocumentCreation.mockClear();
  const fresh = { order_sn: 'NEW1', package_number: 'PNEW1', updated_at: new Date(Date.now()) };
  m.getRecentlyArrangedPackagesAll.mockResolvedValue([fresh, ...old]);
  await ensureDocumentsForArranged(27, shop, on);
  expect(m.requestDocumentCreation.mock.calls[0][1]).toBe('NEW1');
});
it('selection is bounded, pure, and gives every unready package a turn (round robin)', () => {
  const rows = rowsOf(45); const prog = new Map(); let now = 1_000_000; const seen = new Set<string>();
  for (let c = 0; c < 4; c++) {
    const t = selectDocTargets(rows, prog, now); expect(t.length).toBeLessThanOrEqual(20);
    for (const r of t) { seen.add(r.order_sn); prog.set(`${r.order_sn}:${r.package_number}`, { lastTriedAt: now }); }
    now += 100_000;
  }
  expect(seen.size).toBe(45);
});
it('caps creates per package and never ship_order', async () => {
  const rows = rowsOf(1); m.getRecentlyArrangedPackagesAll.mockResolvedValue(rows);
  m.requestDocumentCreation.mockResolvedValue('create_sent_ok');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 0));
  for (let i = 0; i < 6; i++) { await ensureDocumentsForArranged(27, shop, on); vi.advanceTimersByTime(6 * 60_000); }
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(3);
  expect(m.arrangeShipment).not.toHaveBeenCalled();
});
