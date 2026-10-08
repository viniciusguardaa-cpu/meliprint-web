import { describe, it, expect, vi } from 'vitest';
vi.mock('../db.js', () => ({ claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn() }));
import { planArrange, isEligibleOrder } from '../services/shopeeArrange.js';

const validInvoice = { status: 'valid', number: '1', access_key: '1'.repeat(44), issue_date: 1 };
const ok = { order_sn: 'A', order_status: 'READY_TO_SHIP', invoice_data: validInvoice, package_list: [{ package_number: 'P1' }] } as any;

describe('Shopee auto-arrange eligibility', () => {
  it('requires READY_TO_SHIP, valid NF and package numbers', () => {
    expect(isEligibleOrder(ok)).toBe(true);
    expect(isEligibleOrder({ ...ok, order_status: 'PROCESSED' })).toBe(false);
    expect(isEligibleOrder({ ...ok, invoice_data: { ...validInvoice, status: 'pending' } })).toBe(false);
    expect(isEligibleOrder({ ...ok, invoice_data: null })).toBe(false);
    expect(isEligibleOrder({ ...ok, package_list: [] })).toBe(false);
    expect(isEligibleOrder({ ...ok, package_list: [{ package_number: '' }] })).toBe(false);
  });
});

describe('planArrange', () => {
  it('omits package_number for unsplit orders', () => {
    expect(planArrange('A', undefined, { info_needed: { dropoff: [] } }, 'dropoff')).toEqual({ body: { order_sn: 'A', dropoff: {} } });
  });
  const pickupParam = (list: any[]) => ({ info_needed: { pickup: ['address_id', 'pickup_time_id'] }, pickup: { address_list: list } });
  it('uses the pickup address and recommended slot', () => {
    const p = planArrange('A', 'P1', pickupParam([{ address_id: 7, address_flag: ['pickup_address'], time_slot_list: [{ pickup_time_id: 'x' }, { pickup_time_id: 'y', flags: ['recommended'] }] }]), 'pickup');
    expect(p).toEqual({ body: { order_sn: 'A', package_number: 'P1', pickup: { address_id: 7, pickup_time_id: 'y' } } });
  });
  it('allows pickup without slots', () => {
    const p = planArrange('A', 'P1', pickupParam([{ address_id: 7, address_flag: ['default_address'], time_slot_list: null }]), 'pickup');
    expect(p).toEqual({ body: { order_sn: 'A', package_number: 'P1', pickup: { address_id: 7 } } });
  });
  it('skips ambiguous addresses and missing recommended slot', () => {
    expect('skip' in planArrange('A', 'P1', pickupParam([{ address_id: 1, address_flag: [] }, { address_id: 2, address_flag: [] }]), 'pickup')).toBe(true);
    expect('skip' in planArrange('A', 'P1', pickupParam([{ address_id: 1, address_flag: ['pickup_address'], time_slot_list: [{ pickup_time_id: 'x' }] }]), 'pickup')).toBe(true);
  });
  it('never switches method: chosen method must be offered', () => {
    expect('skip' in planArrange('A', 'P1', { info_needed: { dropoff: [] } }, 'pickup')).toBe(true);
    expect('skip' in planArrange('A', 'P1', pickupParam([{ address_id: 1, address_flag: ['pickup_address'] }]), 'dropoff')).toBe(true);
  });
  it('dropoff with empty info_needed sends an empty dropoff object', () => {
    expect(planArrange('A', 'P1', { info_needed: { dropoff: [] } }, 'dropoff')).toEqual({ body: { order_sn: 'A', package_number: 'P1', dropoff: {} } });
  });
  it('skips when extra fields (tracking number, sender name) are required', () => {
    expect('skip' in planArrange('A', 'P1', { info_needed: { dropoff: ['sender_real_name'] } }, 'dropoff')).toBe(true);
    expect('skip' in planArrange('A', 'P1', { info_needed: { pickup: ['address_id', 'tracking_number'] } }, 'pickup')).toBe(true);
  });
});
