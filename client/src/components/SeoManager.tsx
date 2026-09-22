import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { headTagsFor } from '../lib/seo';

/** Tudo que `headTagsFor` emite — removido e recriado a cada troca de rota. */
const MANAGED_SELECTOR = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[name^="twitter:"]',
  'meta[property^="og:"]',
  'link[rel="canonical"]',
  'link[rel="alternate"][hreflang]',
  'script[type="application/ld+json"]',
].join(',');

/**
 * Keeps <head> meta (title, description, canonical, robots, hreflang, Open
 * Graph, Twitter and JSON-LD) in sync with the current route during
 * client-side navigation. The initial HTML already ships the right tags
 * thanks to prerendering — this covers SPA transitions after load.
 */
export default function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.head.querySelectorAll(MANAGED_SELECTOR).forEach((el) => el.remove());

    for (const { tag, attrs, content } of headTagsFor(pathname)) {
      if (tag === 'title') {
        document.title = content ?? '';
        continue;
      }
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
      if (content) el.textContent = content;
      document.head.appendChild(el);
    }
  }, [pathname]);

  return null;
}
