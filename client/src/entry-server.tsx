import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import Root from './Root';

/**
 * SSR entry used only by `scripts/prerender.mjs` at build time. The app is
 * still a CSR SPA at runtime — we just bake the first paint of each public
 * route into static HTML so crawlers and no-JS users get real content.
 */
export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <Root />
    </StaticRouter>
  );
}

// Re-exported so the prerender script can share the single source of truth
// for route metadata.
export {
  PAGE_SEO,
  seoForPath,
  canonicalFor,
  headTagsFor,
  isIndexable,
  SITE_ORIGIN,
  SITE_NAME,
  NOT_FOUND_SEO,
  PRIVATE_SEO,
} from './lib/seo';
