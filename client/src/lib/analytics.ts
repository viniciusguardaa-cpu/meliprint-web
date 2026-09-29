/**
 * First-party analytics helpers.
 * The visitor key persists in localStorage so pricing assignments, UTM
 * attribution and funnel events all resolve to the same anonymous visitor
 * (linked to the account after signup server-side).
 */

const VISITOR_KEY_STORAGE = 'labelgo_visitor_key';

export function getVisitorKey(): string {
  let key = localStorage.getItem(VISITOR_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY_STORAGE, key);
  }
  return key;
}

/** Fire-and-forget event tracking — never blocks UX. */
export function track(event: string, properties?: Record<string, unknown>): void {
  fetch('/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-visitor-key': getVisitorKey(),
    },
    credentials: 'include',
    body: JSON.stringify({ event, properties }),
  }).catch(() => {});
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const UTM_SESSION_FLAG = 'labelgo_utm_captured';

/** Recognize a Google Search referrer without treating arbitrary hostnames as Google. */
export function isGoogleReferrer(referrer: string): boolean {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return /^(?:www\.)?google\.[a-z.]+$/.test(host);
  } catch {
    return false;
  }
}

/**
 * Capture UTM params + referrer once per browser session.
 * Safe to call on every page load — no-ops after the first call.
 */
export function captureUTM(): void {
  if (sessionStorage.getItem(UTM_SESSION_FLAG)) return;
  sessionStorage.setItem(UTM_SESSION_FLAG, '1');

  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) utm[k] = v.slice(0, 255);
  }

  // Envia sempre — mesmo sem UTM/referrer — para o visitante "direto"
  // também entrar na tabela de origem do admin.
  const referrer = document.referrer || undefined;

  // Google Ads auto-tagging supplies click IDs rather than UTMs. Never send the
  // raw IDs to our analytics DB. A Google referrer without either signal is
  // marked organic for NEW records; old unmarked Google rows remain unknown.
  const googleAdClick = ['gclid', 'gbraid', 'wbraid'].some((k) => params.has(k));
  if (googleAdClick) {
    utm.utm_source = 'google';
    utm.utm_medium = 'cpc';
  } else if (!utm.utm_source && !utm.utm_medium && referrer && isGoogleReferrer(referrer)) {
    utm.utm_source = 'google';
    utm.utm_medium = 'organic';
  }

  fetch('/api/analytics/utm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-visitor-key': getVisitorKey(),
    },
    credentials: 'include',
    body: JSON.stringify({
      ...utm,
      referrer,
      landing_path: window.location.pathname.slice(0, 500),
    }),
  }).catch(() => {});
}
