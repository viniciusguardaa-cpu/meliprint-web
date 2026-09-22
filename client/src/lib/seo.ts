/**
 * Central SEO metadata for public routes.
 *
 * Consumed by two places:
 * - `components/SeoManager.tsx` keeps <title>, description, canonical and
 *   robots meta in sync during client-side (SPA) navigation.
 * - `scripts/prerender.mjs` bakes the same tags into the static HTML emitted
 *   per route at build time.
 *
 * `PAGE_SEO` doubles as the prerender route list: every key gets its own
 * `dist/<path>/index.html`.
 *
 * BreadcrumbList/FAQPage JSON-LD are generated from `content/seoPages.ts`, so
 * the structured data can never drift from the visible page content.
 */

import { SEO_PAGES } from '../content/seoPages';
import { LANDING_FAQS } from '../content/landingFaq';

export const SITE_ORIGIN = 'https://labelgo.com.br';
export const SITE_NAME = 'LabelGo';
export const SITE_LOCALE = 'pt_BR';
export const SITE_LANG = 'pt-BR';
export const SUPPORT_EMAIL = 'suporte@labelgo.com.br';

/** 1200x630 — formato recomendado por Facebook, LinkedIn, X e WhatsApp. */
export const DEFAULT_OG_IMAGE = {
  url: `${SITE_ORIGIN}/og-image.png`,
  width: 1200,
  height: 630,
  alt: 'LabelGo — imprima etiquetas do Mercado Livre em segundos, em lote, direto do navegador.',
};

/**
 * Diretivas para páginas indexáveis. `max-image-preview:large` libera a
 * miniatura grande no Google/Discover e `max-snippet:-1` remove o limite de
 * trecho (também respeitado pelo Bing).
 */
export const INDEX_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

export interface RouteSeo {
  title: string;
  description: string;
  /** Defaults to INDEX_ROBOTS when omitted. */
  robots?: string;
  /** JSON-LD blocks rendered into <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown>[];
}

const NOINDEX = 'noindex,follow';

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

const ORGANIZATION_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_ORIGIN}/logo.png`,
    width: 1024,
    height: 341,
  },
  email: SUPPORT_EMAIL,
  sameAs: ['https://www.instagram.com/labelgo_print/'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SUPPORT_EMAIL,
    availableLanguage: ['Portuguese'],
    areaServed: 'BR',
  },
};

const WEBSITE_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  inLanguage: SITE_LANG,
  publisher: { '@id': ORGANIZATION_ID },
};

const SOFTWARE_APPLICATION_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'LabelGo',
  url: `${SITE_ORIGIN}/`,
  image: DEFAULT_OG_IMAGE.url,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Impressão de etiquetas de envio',
  operatingSystem: 'Web',
  inLanguage: SITE_LANG,
  description:
    'Imprima etiquetas do Mercado Livre em lote, direto do navegador. Sem instalação. Teste grátis por 7 dias.',
  featureList: [
    'Impressão de etiquetas do Mercado Livre em lote',
    'Etiquetas 10x15 em PDF pelo navegador',
    'Envio de ZPL para impressora térmica',
    'Impressão automática com agente para Windows (plano Pro)',
    'Conexão oficial via OAuth do Mercado Livre',
  ],
  publisher: { '@id': ORGANIZATION_ID },
  // Sem "offers": os preços vêm de /api/plans e podem variar por experimento
  // de pricing — um valor fixo aqui ficaria dessincronizado da oferta vigente.
};

/** O conversor é gratuito de verdade, então o preço 0 é estável e correto. */
const ZPL_CONVERTER_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Conversor de ZPL para PDF — LabelGo',
  url: `${SITE_ORIGIN}/converter-zpl-pdf/`,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requer JavaScript',
  inLanguage: SITE_LANG,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
  publisher: { '@id': ORGANIZATION_ID },
};

/** BreadcrumbList matching the visible breadcrumb rendered by SeoPage. */
function breadcrumbLd(pathname: string, crumb: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Início',
        item: `${SITE_ORIGIN}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: crumb,
        item: canonicalFor(pathname),
      },
    ],
  };
}

/** FAQPage for a visible FAQ section (guide pages and the landing). */
function faqLd(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** JSON-LD blocks for a guide page: breadcrumb + FAQ (when it has one). */
function guideLd(pathname: string): Record<string, unknown>[] {
  const page = SEO_PAGES[pathname];
  if (!page) return [];
  const blocks = [breadcrumbLd(pathname, page.crumb)];
  if (page.faqs?.length) blocks.push(faqLd(page.faqs));
  return blocks;
}

export const PAGE_SEO: Record<string, RouteSeo> = {
  '/': {
    title: 'LabelGo — Imprima etiquetas do Mercado Livre em segundos',
    description:
      'Conecte sua conta do Mercado Livre, selecione os envios e imprima etiquetas 10x15 em PDF pelo navegador ou em impressora térmica. Teste grátis por 7 dias.',
    jsonLd: [ORGANIZATION_LD, WEBSITE_LD, SOFTWARE_APPLICATION_LD, faqLd(LANDING_FAQS)],
  },
  '/pricing': {
    title: 'Planos e preços — LabelGo',
    description:
      'Compare os planos do LabelGo e imprima etiquetas do Mercado Livre em segundos. Teste grátis por 7 dias, sem cartão de crédito. Cancele quando quiser.',
    jsonLd: [breadcrumbLd('/pricing', 'Planos')],
  },
  '/converter-zpl-pdf': {
    title: 'Conversor de ZPL para PDF grátis — LabelGo',
    description:
      'Cole o código ZPL da sua etiqueta e baixe o PDF em segundos. Ferramenta online gratuita, sem login e sem cadastro — ideal para etiquetas do Mercado Livre.',
    jsonLd: [ZPL_CONVERTER_LD, ...guideLd('/converter-zpl-pdf')],
  },
  '/imprimir-zpl': {
    title: 'Como imprimir ZPL: guia completo para vendedores — LabelGo',
    description:
      'O que é ZPL e três formas de imprimir etiquetas ZPL do Mercado Livre: impressora térmica, conversão gratuita para PDF ou impressão automática.',
    jsonLd: guideLd('/imprimir-zpl'),
  },
  '/etiqueta-mercado-livre': {
    title: 'Etiqueta do Mercado Livre: como gerar e imprimir — LabelGo',
    description:
      'Onde encontrar a etiqueta de envio no Mercado Livre, os formatos disponíveis (PDF e ZPL) e como imprimir várias etiquetas de uma vez.',
    jsonLd: guideLd('/etiqueta-mercado-livre'),
  },
  '/imprimir-etiqueta-mercado-livre': {
    title: 'Imprimir etiqueta do Mercado Livre: passo a passo — LabelGo',
    description:
      'Passo a passo para imprimir etiquetas do Mercado Livre: conectar a conta, selecionar envios e imprimir em PDF pelo navegador ou em impressora térmica.',
    jsonLd: guideLd('/imprimir-etiqueta-mercado-livre'),
  },
  '/etiqueta-10x15': {
    title: 'Etiqueta 10x15 do Mercado Livre: formato e impressão — LabelGo',
    description:
      'A etiqueta 10x15 cm (100x150 mm) é o formato padrão de envio do Mercado Livre. Veja como imprimir em impressora térmica ou comum.',
    jsonLd: guideLd('/etiqueta-10x15'),
  },
  '/impressora-termica-mercado-livre': {
    title: 'Impressora térmica para Mercado Livre: o que verificar — LabelGo',
    description:
      'Como escolher uma impressora térmica para etiquetas 10x15 do Mercado Livre: largura de bobina, compatibilidade com ZPL e alternativa em PDF.',
    jsonLd: guideLd('/impressora-termica-mercado-livre'),
  },
  '/reimprimir-etiqueta-mercado-livre': {
    title: 'Reimprimir etiqueta do Mercado Livre: quando e como — LabelGo',
    description:
      'Etiqueta rasgou ou colou errado? Veja como reimprimir a mesma etiqueta do Mercado Livre sem custo adicional, pelo painel ou pelo LabelGo.',
    jsonLd: guideLd('/reimprimir-etiqueta-mercado-livre'),
  },
  '/imprimir-etiquetas-em-lote': {
    title: 'Imprimir etiquetas em lote no Mercado Livre — LabelGo',
    description:
      'Selecione vários envios e imprima todas as etiquetas do Mercado Livre de uma vez em um único PDF, direto do navegador. Teste grátis.',
    jsonLd: guideLd('/imprimir-etiquetas-em-lote'),
  },
  '/termos': {
    title: 'Termos de Uso — LabelGo',
    description:
      'Termos de Uso do LabelGo: regras de assinatura, cancelamento, uso permitido e responsabilidades do serviço de impressão de etiquetas.',
  },
  '/privacidade': {
    title: 'Política de Privacidade — LabelGo',
    description:
      'Política de Privacidade do LabelGo: quais dados coletamos, como usamos, com quem compartilhamos e seus direitos sob a LGPD.',
  },

  // Utility pages — renderizadas para funcionar sem JS e ter título próprio,
  // mas não devem aparecer em resultados de busca.
  '/login': {
    title: 'Entrar — LabelGo',
    description: 'Acesse sua conta do LabelGo.',
    robots: NOINDEX,
  },
  '/cadastro': {
    title: 'Criar conta — LabelGo',
    description: 'Crie sua conta do LabelGo e comece a imprimir etiquetas.',
    robots: NOINDEX,
  },
  '/esqueci-senha': {
    title: 'Esqueci a senha — LabelGo',
    description: 'Receba um link para redefinir sua senha do LabelGo.',
    robots: NOINDEX,
  },
  '/redefinir-senha': {
    title: 'Redefinir senha — LabelGo',
    description: 'Defina uma nova senha para sua conta do LabelGo.',
    robots: NOINDEX,
  },
  '/verificar-email': {
    title: 'Verificação de e-mail — LabelGo',
    description: 'Confirmação de e-mail da sua conta do LabelGo.',
    robots: NOINDEX,
  },
};

/** Meta applied to authenticated/app routes (served via the spa.html shell). */
export const PRIVATE_SEO: RouteSeo = {
  title: `LabelGo — área do cliente`,
  description: 'Área logada do LabelGo.',
  robots: NOINDEX,
};

/** Meta applied to unmatched routes (React renders the 404 screen). */
export const NOT_FOUND_SEO: RouteSeo = {
  title: `Página não encontrada — ${SITE_NAME}`,
  description: 'O endereço que você tentou acessar não existe ou foi movido.',
  robots: 'noindex',
};

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/print',
  '/auto-print',
  '/subscription',
  '/configuracoes',
  '/admin',
];

/** Resolve the SEO meta for any pathname (exact match → private → 404). */
export function seoForPath(pathname: string): RouteSeo {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const exact = PAGE_SEO[normalizedPath];
  if (exact) return exact;
  if (PRIVATE_PREFIXES.some((p) => normalizedPath === p || normalizedPath.startsWith(`${p}/`))) {
    return PRIVATE_SEO;
  }
  return NOT_FOUND_SEO;
}

/** Absolute canonical URL for an indexable path. */
export function canonicalFor(pathname: string): string {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return `${SITE_ORIGIN}${normalizedPath === '/' ? '/' : `${normalizedPath}/`}`;
}

export function isIndexable(meta: RouteSeo): boolean {
  return !(meta.robots ?? '').includes('noindex');
}

export interface HeadTag {
  tag: 'title' | 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  content?: string;
}

/**
 * Tags de <head> de uma rota — fonte única para o prerender (HTML estático)
 * e para o SeoManager (navegação SPA), garantindo que os dois nunca divirjam.
 */
export function headTagsFor(pathname: string, meta: RouteSeo = seoForPath(pathname)): HeadTag[] {
  const indexable = isIndexable(meta);
  const canonical = indexable ? canonicalFor(pathname) : null;
  const ogUrl = canonical ?? `${SITE_ORIGIN}/`;
  const m = (key: 'name' | 'property', id: string, content: string): HeadTag => ({
    tag: 'meta',
    attrs: { [key]: id, content },
  });

  const tags: HeadTag[] = [
    { tag: 'title', content: meta.title },
    m('name', 'description', meta.description),
    m('name', 'robots', meta.robots ?? INDEX_ROBOTS),
  ];
  if (canonical) {
    tags.push(
      { tag: 'link', attrs: { rel: 'canonical', href: canonical } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: SITE_LANG, href: canonical } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: canonical } },
    );
  }
  tags.push(
    m('property', 'og:title', meta.title),
    m('property', 'og:description', meta.description),
    m('property', 'og:type', 'website'),
    m('property', 'og:url', ogUrl),
    m('property', 'og:locale', SITE_LOCALE),
    m('property', 'og:site_name', SITE_NAME),
    m('property', 'og:image', DEFAULT_OG_IMAGE.url),
    m('property', 'og:image:secure_url', DEFAULT_OG_IMAGE.url),
    m('property', 'og:image:type', 'image/png'),
    m('property', 'og:image:width', String(DEFAULT_OG_IMAGE.width)),
    m('property', 'og:image:height', String(DEFAULT_OG_IMAGE.height)),
    m('property', 'og:image:alt', DEFAULT_OG_IMAGE.alt),
    m('name', 'twitter:card', 'summary_large_image'),
    m('name', 'twitter:title', meta.title),
    m('name', 'twitter:description', meta.description),
    m('name', 'twitter:image', DEFAULT_OG_IMAGE.url),
    m('name', 'twitter:image:alt', DEFAULT_OG_IMAGE.alt),
  );
  for (const block of meta.jsonLd ?? []) {
    tags.push({ tag: 'script', attrs: { type: 'application/ld+json' }, content: JSON.stringify(block) });
  }
  return tags;
}
