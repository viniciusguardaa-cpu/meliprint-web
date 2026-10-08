// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MiniBars } from '../AdminMiniBars';
afterEach(cleanup);

it('caps each bar so a single day does not fill the chart width', () => {
  const { container } = render(<MiniBars color="bg-primary" data={[{ label: '08/10', value: 23 }]} />);
  const bar = container.querySelector('[title]') as HTMLElement;
  expect(bar.classList.contains('max-w-10')).toBe(true);
  expect(bar.classList.contains('min-w-0')).toBe(true);
  expect(bar.style.height).toBe('100%');
});

it('keeps proportional heights and a faint baseline for zero days', () => {
  const { container } = render(<MiniBars color="bg-primary" data={[
    { label: '06/10', value: 0 }, { label: '07/10', value: 10 }, { label: '08/10', value: 20 },
  ]} />);
  const bars = [...container.querySelectorAll<HTMLElement>('[title]')];
  expect(bars.map(b => b.style.height)).toEqual(['1%', '50%', '100%']);
  expect(bars[0].style.opacity).toBe('0.25');
});

it('handles an empty series', () => {
  const { container } = render(<MiniBars color="bg-primary" data={[]} />);
  expect(container.querySelector('[title]')).toBeNull();
});
