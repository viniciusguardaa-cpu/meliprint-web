// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminGrowthPanel } from '../AdminGrowthPanel';
import type { GrowthMetrics } from '../adminTypes';
afterEach(cleanup);
const growth: GrowthMetrics = {
  days: -1,
  funnel: { page_views: 0, unique_visitors: 0, landing_visitors: 0, registered: 0, oauth_started: 0, ml_connected: 0, pricing_visitors: 0, checkouts_started: 0, trials_started: 0, subscriptions_activated: 0, subscriptions_cancelled: 0 },
  abandonment: { checkout_abandoned: 0, trials_not_converted: 0, pricing_no_checkout: 0 },
  top_pages: [], visitors_by_day: [], traffic_sources: [], utm_performance: [],
  agents: { agents_online: 0, agents_offline: 0 }, prints: { prints_success: 0, prints_failed: 0 },
};
it('adds Hoje without removing the existing filters and explains midnight', () => {
  const onChangeDays = vi.fn();
  render(<AdminGrowthPanel growth={growth} growthDays={-1} onChangeDays={onChangeDays} />);
  const today = screen.getByRole('button', { name: 'Hoje' });
  expect(today.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Desde 00h de hoje · horário de São Paulo')).toBeTruthy();
  for (const label of ['7d', '30d', '90d', 'Tudo']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  fireEvent.click(today);
  expect(onChangeDays).toHaveBeenCalledWith(-1);
  fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));
  expect(onChangeDays).toHaveBeenLastCalledWith(0);
});
it('does not show the today explanation for rolling periods', () => {
  render(<AdminGrowthPanel growth={growth} growthDays={30} onChangeDays={vi.fn()} />);
  expect(screen.queryByText('Desde 00h de hoje · horário de São Paulo')).toBeNull();
});
it('shows the date and visitor count when the series has only one day', () => {
  render(<AdminGrowthPanel growth={{ ...growth, visitors_by_day: [{ day: '2026-10-08', visitors: 23, views: 55 }] }} growthDays={-1} onChangeDays={vi.fn()} />);
  expect(screen.getByText('08/10 · 23 visitantes únicos')).toBeTruthy();
});
it('does not add a single-day caption to multiple days', () => {
  render(<AdminGrowthPanel growth={{ ...growth, visitors_by_day: [{ day: '2026-10-07', visitors: 16, views: 70 }, { day: '2026-10-08', visitors: 23, views: 55 }] }} growthDays={7} onChangeDays={vi.fn()} />);
  expect(screen.queryByText('08/10 · 23 visitantes únicos')).toBeNull();
});
