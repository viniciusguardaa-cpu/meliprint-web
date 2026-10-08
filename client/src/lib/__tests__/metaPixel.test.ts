// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules(); localStorage.clear(); sessionStorage.clear();
  document.head.innerHTML = ''; delete window.fbq; delete window._fbq;
  window.history.replaceState({}, '', '/');
});
describe('Meta consent and verified events', () => {
  it('does not load or queue anything before consent or after rejection', async () => {
    const m = await import('../metaPixel');
    m.trackMetaPageView('/'); m.trackMetaEvent('CompleteRegistration', '1');
    expect(window.fbq).toBeUndefined();
    m.setMarketingConsent('denied'); m.trackMetaPageView('/');
    expect(document.querySelector('#labelgo-meta-pixel')).toBeNull();
  });
  it('initializes once, disables automatic collection and deduplicates', async () => {
    const m = await import('../metaPixel'); m.setMarketingConsent('granted');
    m.trackMetaPageView('/'); m.trackMetaPageView('/');
    m.trackMetaEvent('CompleteRegistration', '1'); m.trackMetaEvent('CompleteRegistration', '1');
    expect(document.querySelectorAll('#labelgo-meta-pixel')).toHaveLength(1);
    expect(window.fbq?.queue.filter(x => x[1] === 'PageView')).toHaveLength(1);
    expect(window.fbq?.queue.filter(x => x[1] === 'CompleteRegistration')).toHaveLength(1);
    expect(window.fbq?.queue).toContainEqual(['set', 'autoConfig', false, m.META_PIXEL_ID]);
    m.setMarketingConsent('denied');
    const before = window.fbq?.queue.length;
    m.trackMetaEvent('StartTrial', 'trial'); expect(window.fbq?.queue.length).toBe(before);
  });
  it('blocks private routes and sensitive query strings', async () => {
    const m = await import('../metaPixel'); m.setMarketingConsent('granted');
    window.history.replaceState({}, '', '/admin'); m.trackMetaPageView('/admin');
    window.history.replaceState({}, '', '/cadastro?token=secret'); m.trackMetaEvent('CompleteRegistration', '1');
    expect(window.fbq).toBeUndefined();
    window.history.replaceState({}, '', '/?utm_source=meta&fbclid=test'); m.trackMetaPageView('/');
    expect(window.fbq).toBeDefined();
  });
  it('only queues verified paid Subscribe on the clean dashboard; never Purchase', async () => {
    const m = await import('../metaPixel'); m.setMarketingConsent('granted');
    m.saveConfirmedMetaSubscription({id: 'pending', status: 'pending', price: 19.9, currency: 'BRL'});
    expect(sessionStorage.getItem('labelgo:meta-confirmed-subscription')).toBeNull();
    window.history.replaceState({}, '', '/subscription/callback?preapproval_id=abc');
    m.saveConfirmedMetaSubscription({id: 'abc', status: 'authorized', price: 19.9, currency: 'BRL'});
    expect(window.fbq).toBeUndefined();
    window.history.replaceState({}, '', '/dashboard'); m.flushConfirmedMetaSubscription(); m.flushConfirmedMetaSubscription();
    expect(window.fbq?.queue.filter(x => x[1] === 'Subscribe')).toHaveLength(1);
    expect(window.fbq?.queue.some(x => x[1] === 'Purchase')).toBe(false);
  });
});
