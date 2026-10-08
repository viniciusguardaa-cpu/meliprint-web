// The public pixel identifier is not a secret. No CAPI or advanced matching.
export const META_PIXEL_ID = '1772125387373871';
export const CONSENT_KEY = 'labelgo:meta-marketing-consent:v1';
type Pixel = ((...args: unknown[]) => void) & { queue: unknown[][]; callMethod?: (...args: unknown[]) => void; loaded: boolean; version: string; push?: Pixel };
declare global { interface Window { fbq?: Pixel; _fbq?: Pixel } }
export type Consent = 'granted' | 'denied' | null;
export function getMarketingConsent(): Consent {
  try { const value = localStorage.getItem(CONSENT_KEY); return value === 'granted' || value === 'denied' ? value : null; } catch { return null; }
}
let initialized = false;
let lastPage = '';
export function setMarketingConsent(value: Exclude<Consent, null>) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* fail closed */ }
  if (value === 'denied' && window.fbq) window.fbq('consent', 'revoke');
  window.dispatchEvent(new Event('labelgo:marketing-consent'));
}
function ready() {
  // Do not send query strings, hash tokens, admin routes or print/order URLs.
  if (getMarketingConsent() !== 'granted' || Array.from(new URLSearchParams(location.search).keys()).some(key => key !== 'fbclid' && !key.startsWith('utm_')) || location.hash || !['/', '/pricing', '/cadastro', '/login', '/dashboard'].includes(location.pathname)) return false;
  if (!initialized) {
    const pixel = function (...args: unknown[]) { pixel.callMethod ? pixel.callMethod(...args) : pixel.queue.push(args); } as Pixel;
    pixel.queue = []; pixel.loaded = true; pixel.version = '2.0'; pixel.push = pixel;
    window.fbq = window._fbq = pixel;
    pixel('consent', 'grant');
    pixel('set', 'autoConfig', false, META_PIXEL_ID);
    pixel('init', META_PIXEL_ID);
    const script = document.createElement('script');
    script.id = 'labelgo-meta-pixel'; script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    initialized = true;
  } else window.fbq?.('consent', 'grant');
  return true;
}
export function trackMetaPageView(path: string) {
  // Page views only for the acquisition funnel, never customer order pages.
  if (!['/', '/pricing', '/cadastro', '/login'].includes(path) || !ready() || lastPage === path) return;
  window.fbq?.('track', 'PageView'); lastPage = path;
}
export function trackMetaEvent(event: 'CompleteRegistration' | 'StartTrial' | 'Subscribe', localKey: string, params: Record<string, unknown> = {}) {
  if (!ready()) return false;
  const key = `labelgo:meta:${event}:${localKey}`;
  try { if (localStorage.getItem(key)) return false; } catch { return false; }
  window.fbq?.('track', event, params);
  try { localStorage.setItem(key, '1'); } catch { /* no replay if storage fails */ }
  return true;
}
export function saveConfirmedMetaSubscription(sub: {id: string; status: string; price: number; currency: string}) {
  if (getMarketingConsent() !== 'granted' || !['authorized', 'active'].includes(sub.status) || sub.currency !== 'BRL' || !Number.isFinite(Number(sub.price)) || Number(sub.price) <= 0) return;
  try { sessionStorage.setItem('labelgo:meta-confirmed-subscription', JSON.stringify({id: sub.id, price: Number(sub.price)})); } catch { /* unavailable */ }
}
export function flushConfirmedMetaSubscription() {
  if (location.pathname !== '/dashboard' || !ready()) return;
  try {
    const raw = sessionStorage.getItem('labelgo:meta-confirmed-subscription');
    if (!raw) return;
    const sub = JSON.parse(raw);
    if (typeof sub.id === 'string' && Number.isFinite(sub.price) && sub.price > 0) trackMetaEvent('Subscribe', sub.id, {currency: 'BRL', value: sub.price});
    sessionStorage.removeItem('labelgo:meta-confirmed-subscription');
  } catch { /* unavailable */ }
}
