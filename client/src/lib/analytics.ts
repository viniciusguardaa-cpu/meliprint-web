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

  const referrer = document.referrer || undefined;
  const hasData = Object.keys(utm).length > 0 || referrer;
  if (!hasData) return;

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
