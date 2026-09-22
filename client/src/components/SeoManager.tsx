import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { canonicalFor, seoForPath, DEFAULT_OG_IMAGE, SITE_ORIGIN, SITE_NAME } from '../lib/seo';

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Keeps <head> meta (title, description, canonical, robots, Open Graph) in
 * sync with the current route during client-side navigation. The initial HTML
 * already ships the right tags thanks to prerendering — this covers SPA
 * transitions after load.
 */
export default function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = seoForPath(pathname);
    const noindex = (meta.robots ?? '').includes('noindex');
    const canonical = noindex ? null : canonicalFor(pathname);

    document.title = meta.title;
    setMetaByName('description', meta.description);
    setMetaByName('robots', meta.robots ?? 'index,follow');
    setCanonical(canonical);

    setMetaByProperty('og:title', meta.title);
    setMetaByProperty('og:description', meta.description);
    setMetaByProperty('og:type', 'website');
    setMetaByProperty('og:url', canonical ?? SITE_ORIGIN);
    setMetaByProperty('og:locale', 'pt_BR');
    setMetaByProperty('og:site_name', SITE_NAME);
    setMetaByProperty('og:image', DEFAULT_OG_IMAGE);

    setMetaByName('twitter:title', meta.title);
    setMetaByName('twitter:description', meta.description);
  }, [pathname]);

  return null;
}
