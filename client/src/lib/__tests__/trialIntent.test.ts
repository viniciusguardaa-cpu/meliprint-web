// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { rememberTrialIntent, trialDestination, clearTrialIntent } from '../trialIntent';
beforeEach(() => sessionStorage.clear());
it('ordinary login keeps the dashboard destination', () => {
  expect(trialDestination()).toBe('/dashboard');
});
it('free-test intent survives login and returns to explicit plan review', () => {
  rememberTrialIntent();
  expect(trialDestination()).toBe('/pricing');
  expect(trialDestination()).toBe('/pricing');
});
it('successful trial clears the pending intent', () => {
  rememberTrialIntent(); clearTrialIntent();
  expect(trialDestination()).toBe('/dashboard');
});
