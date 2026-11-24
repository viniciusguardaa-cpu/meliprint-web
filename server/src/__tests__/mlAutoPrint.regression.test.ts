import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../db.js', () => ({
  recordMLNotificationIfNew: vi.fn(), markMLNotificationProcessed: vi.fn(), markMLNotificationFailed: vi.fn(),
  getAutoPrintEnabledConfigs: vi.fn(), addPrintQueueJob: vi.fn(), getMarketplaceAccountByExternal: vi.fn()
}));
vi.mock('../providers/index.js', () => ({ getProvider: vi.fn() }));
vi.mock('../services/accounts.js', () => ({ getFreshAccountContext: vi.fn() }));
vi.mock('../services/mercadolivre.js', () => ({ getShipment: vi.fn() }));
import * as db from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { getShipment } from '../services/mercadolivre.js';
import { reprocessNotificationRow, notificationDeliveryKey } from '../routes/notifications.js';
const row = { id: 10, topic: 'shipments', resource: '/shipments/12345', user_id: 555, payload: {} };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.markMLNotificationFailed).mockResolvedValue(undefined);
  vi.mocked(db.getMarketplaceAccountByExternal).mockResolvedValue({ id: 7, user_id: 42 });
  vi.mocked(db.getAutoPrintEnabledConfigs).mockResolvedValue([{ user_id: 42, enabled: true }]);
  vi.mocked(getFreshAccountContext).mockResolvedValue({ accountId: 7, provider: 'mercadolivre', externalUserId: '555', accessToken: 'mock' });
  vi.mocked(getShipment).mockResolvedValue({ status: 'ready_to_ship', substatus: 'ready_to_print' } as any);
  vi.mocked(getProvider).mockReturnValue({ getLabelsZPL: vi.fn(async () => '^XA^FDORIGINAL_ML^FS^XZ') } as any);
});
describe('ML event-driven printing regression', () => {
  it('keeps the original single-shipment ZPL payload and entitled owner unchanged', async () => {
    await reprocessNotificationRow(row);
    expect(db.getMarketplaceAccountByExternal).toHaveBeenCalledWith('mercadolivre', '555');
    expect(getShipment).toHaveBeenCalledWith('mock', 12345);
    expect(db.addPrintQueueJob).toHaveBeenCalledWith(42, 12345, '^XA^FDORIGINAL_ML^FS^XZ', 'mercadolivre');
    expect(db.markMLNotificationProcessed).toHaveBeenCalledWith(10);
    expect(db.markMLNotificationFailed).not.toHaveBeenCalled();
  });
  it('does not print an unready shipment or an account without Pro access', async () => {
    vi.mocked(getShipment).mockResolvedValueOnce({ status: 'shipped', substatus: '' } as any);
    await reprocessNotificationRow(row);
    vi.mocked(db.getAutoPrintEnabledConfigs).mockResolvedValueOnce([]);
    await reprocessNotificationRow(row);
    expect(db.addPrintQueueJob).not.toHaveBeenCalled();
  });
  it('persists transient ML failures for the existing notification sweeper', async () => {
    vi.mocked(getShipment).mockRejectedValue(new Error('ML unavailable'));
    await reprocessNotificationRow(row);
    expect(db.markMLNotificationFailed).toHaveBeenCalledWith(10, 'ML unavailable');
    expect(db.markMLNotificationProcessed).not.toHaveBeenCalled();
    expect(db.addPrintQueueJob).not.toHaveBeenCalled();
  });
  it('keeps notification deduplication per delivery, not per shipment', () => {
    const body = { topic: 'shipments', resource: '/shipments/12345', sent: '2026-11-24T12:00:00Z' };
    expect(notificationDeliveryKey({ ...body, _id: 'first' })).toBe('first');
    expect(notificationDeliveryKey(body)).toBe(notificationDeliveryKey({ ...body }));
    expect(notificationDeliveryKey(body)).not.toBe(notificationDeliveryKey({ ...body, sent: '2026-11-24T12:01:00Z' }));
  });
});
