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
 *   - dist/sitemap.xml — every indexable route in PAGE_SEO (never drifts).
 *   - dist/llms.txt   — resumo do site para buscadores de IA (ChatGPT,
 *                       Perplexity, Gemini, Copilot…), gerado do mesmo PAGE_SEO.
 *   - dist/404.html   — real NotFound page; Netlify serves it with status 404
 *                       for unmatched paths once the SPA catch-all is gone.
 *   - dist/spa.html   — bare, noindex'd shell used as the rewrite target for
 *                       private/app routes (dashboard, admin, …).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
  headTagsFor,
  isIndexable,
  SITE_NAME,
} = await import(join(clientDir, 'dist-ssr', 'entry-server.js'));

const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip the generic SEO tags shipped in the template head. */
function stripSeoTags(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="(description|robots)"[\s\S]*?\/>/g, '')
    .replace(/\s*<link rel="canonical"[\s\S]*?\/>/, '')
    .replace(/\s*<link rel="alternate" hreflang[\s\S]*?\/>/g, '')
    .replace(/\s*<meta property="og:[^"]*"[\s\S]*?\/>/g, '')
    .replace(/\s*<meta name="twitter:[^"]*"[\s\S]*?\/>/g, '')
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
}

/** Per-route head block — same tag list the SeoManager applies at runtime. */
function headBlock(meta, pathname) {
  return headTagsFor(pathname, meta)
    .map(({ tag, attrs = {}, content = '' }) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('');
      if (tag === 'title') return `    <title>${escapeHtml(content)}</title>`;
      // "<" escapado impede que um texto do JSON-LD feche o <script> antes da hora.
      if (tag === 'script') return `    <script${a}>${content.replace(/</g, '\\u003c')}</script>`;
      return `    <${tag}${a} />`;
    })
    .join('\n');
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
const spaHtml = buildPage(template, PRIVATE_SEO, '/app', '');
writeFileSync(join(distDir, 'spa.html'), spaHtml);

// Shell exclusiva do /admin: manifest próprio com start_url=/admin para o
// "Adicionar à Tela de Início" abrir direto no painel como app standalone
// (o manifest principal forçaria start_url=/). Metas Apple cobrem iOS <17.
const adminHtml = spaHtml
  .replace('href="/manifest.webmanifest"', 'href="/manifest-admin.webmanifest"')
  // Sem zoom no app admin: viewport trava pinch/double-tap e a fonte >=16px
  // nos inputs evita o auto-zoom do iOS ao focar um campo (Safari ignora
  // user-scalable=no no browser, mas respeita dentro do app standalone).
  .replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />'
  )
  .replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>LabelGo Admin</title>
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="LabelGo Admin" />
    <style>
      @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
      body { touch-action: manipulation; }
    </style>`
  );
writeFileSync(join(distDir, 'admin.html'), adminHtml);

// Sitemap gerado do PAGE_SEO: só rotas indexáveis, com a URL canônica exata.
// lastmod = data do último commit que tocou conteúdo/páginas (estável entre
// builds sem mudança de conteúdo — Google e Bing desconfiam de lastmod que
// muda a cada deploy).
function contentLastmod() {
  try {
    const out = execSync('git log -1 --format=%cs -- src/content src/pages src/components src/lib/seo.ts', {
      cwd: clientDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // sem git no ambiente de build — cai na data atual
  }
  return new Date().toISOString().slice(0, 10);
}

const indexable = Object.keys(PAGE_SEO).filter((p) => isIndexable(PAGE_SEO[p]));
const lastmod = contentLastmod();
writeFileSync(
  join(distDir, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...indexable.map((p) => `  <url><loc>${canonicalFor(p)}</loc><lastmod>${lastmod}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n')
);

// llms.txt (https://llmstxt.org) — mapa legível por LLMs das páginas públicas.
const home = PAGE_SEO['/'];
const link = (p) => `- [${PAGE_SEO[p].title.replace(/ — LabelGo$/, '')}](${canonicalFor(p)}): ${PAGE_SEO[p].description}`;
const legal = ['/termos', '/privacidade'];
writeFileSync(
  join(distDir, 'llms.txt'),
  [
    `# ${SITE_NAME}`,
    '',
    `> ${home.description}`,
    '',
    'LabelGo é um SaaS brasileiro para vendedores do Mercado Livre: conecta a conta via OAuth oficial, lista os envios prontos e imprime as etiquetas 10x15 em lote — em PDF pelo navegador ou em ZPL direto na impressora térmica. O plano Pro inclui impressão automática com um agente para Windows. LabelGo não é afiliado ao Mercado Livre.',
    '',
    '## Produto',
    '',
    link('/'),
    link('/pricing'),
    link('/converter-zpl-pdf'),
    '',
    '## Guias',
    '',
    ...indexable.filter((p) => !['/', '/pricing', '/converter-zpl-pdf', ...legal].includes(p)).map(link),
    '',
    '## Optional',
    '',
    ...legal.filter((p) => PAGE_SEO[p]).map(link),
    '',
  ].join('\n')
);

console.log(`Prerendered ${written.length} routes:`);
for (const p of written) console.log(`  ${p}`);
console.log(`  + 404.html, spa.html, sitemap.xml (${indexable.length} URLs), llms.txt`);
