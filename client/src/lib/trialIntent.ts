// Keep the free-test intent across email/OAuth login without triggering checkout.
const KEY = 'labelgo:free-test-intent';
export function rememberTrialIntent() { try { sessionStorage.setItem(KEY, '1'); } catch { /* unavailable */ } }
export function trialDestination() { try { return sessionStorage.getItem(KEY) === '1' ? '/pricing' : '/dashboard'; } catch { return '/dashboard'; } }
export function clearTrialIntent() { try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ } }
