/**
 * Build-time prerender for the public pages.
 *
 * Pipeline (see `build` script in package.json):
 *   1. vite build                    → dist/ (client bundle + index.html shell)
 *   2. vite build --ssr              → dist-ssr/entry-server.js (Node bundle)
 *   3. node scripts/prerender.mjs    → this script
 *
 * For every path in PAGE_SEO we render the React app with renderToString and
 * emit dist/<path>/index.html carrying that route's own <title>, description,
 * canonical, OG/Twitter tags, JSON-LD and the page markup inside #root.
 * Browsers then hydrate the markup (see main.tsx); crawlers and no-JS users
 * get complete, correct HTML.
 *
 * It also emits:
 *   - dist/404.html   — real NotFound page; Netlify serves it with status 404
 *                       for unmatched paths once the SPA catch-all is gone.
 *   - dist/spa.html   — bare, noindex'd shell used as the rewrite target for
 *                       private/app routes (dashboard, admin, …).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node < 19 has no global WebCrypto — Pricing calls crypto.randomUUID()
// during render.
if (!globalThis.crypto?.randomUUID) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

const clientDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(clientDir, 'dist');

const {
  render,
  PAGE_SEO,
  NOT_FOUND_SEO,
  PRIVATE_SEO,
  canonicalFor,
  SITE_ORIGIN,
} = await import(join(clientDir, 'dist-ssr', 'entry-server.js'));

const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/logo.png`;

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip the generic SEO tags shipped in the template head. */
function stripSeoTags(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="description"[\s\S]*?\/>/, '')
    .replace(/\s*<link rel="canonical"[\s\S]*?\/>/, '')
    .replace(/\s*<meta property="og:[^"]*"[\s\S]*?\/>/g, '')
    .replace(/\s*<meta name="twitter:[^"]*"[\s\S]*?\/>/g, '')
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
}

/** Per-route head block: unique title/description/canonical + social tags. */
function headBlock(meta, pathname) {
  const noindex = (meta.robots ?? '').includes('noindex');
  const canonical = noindex ? null : canonicalFor(pathname);
  const ogUrl = canonical ?? SITE_ORIGIN;

  const lines = [
    `    <title>${escapeHtml(meta.title)}</title>`,
    `    <meta name="description" content="${escapeAttr(meta.description)}" />`,
    `    <meta name="robots" content="${meta.robots ?? 'index,follow'}" />`,
  ];
  if (canonical) lines.push(`    <link rel="canonical" href="${canonical}" />`);
  lines.push(
    `    <meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `    <meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:url" content="${ogUrl}" />`,
    `    <meta property="og:locale" content="pt_BR" />`,
    `    <meta property="og:site_name" content="LabelGo" />`,
    `    <meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`,
    `    <meta name="twitter:card" content="summary" />`,
    `    <meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `    <meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
  );
  for (const block of meta.jsonLd ?? []) {
    lines.push(`    <script type="application/ld+json">${JSON.stringify(block)}</script>`);
  }
  return lines.join('\n');
}

function buildPage(template, meta, pathname, appHtml) {
  let html = stripSeoTags(template);
  html = html.replace('</head>', `${headBlock(meta, pathname)}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
  return html;
}

function outFile(pathname) {
  if (pathname === '/') return join(distDir, 'index.html');
  const dir = join(distDir, pathname.slice(1));
  mkdirSync(dir, { recursive: true });
  return join(dir, 'index.html');
}

const template = readFileSync(join(distDir, 'index.html'), 'utf8');

const written = [];
for (const pathname of Object.keys(PAGE_SEO)) {
  const meta = PAGE_SEO[pathname];
  let appHtml = '';
  try {
    appHtml = render(pathname);
  } catch (err) {
    console.error(`✗ prerender failed for ${pathname}`);
    throw err;
  }
  writeFileSync(outFile(pathname), buildPage(template, meta, pathname, appHtml));
  written.push(pathname);
}

// Real 404 page — served by Netlify (and the Express fallback) with status 404.
writeFileSync(
  join(distDir, '404.html'),
  buildPage(template, NOT_FOUND_SEO, '/404', render('/404'))
);

// Bare noindex shell — rewrite target for authenticated/utility SPA routes.
writeFileSync(join(distDir, 'spa.html'), buildPage(template, PRIVATE_SEO, '/app', ''));

console.log(`Prerendered ${written.length} routes:`);
for (const p of written) console.log(`  ${p}`);
console.log('  + 404.html, spa.html');
