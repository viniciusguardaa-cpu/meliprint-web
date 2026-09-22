import { Mail } from 'lucide-react';
import Logo from '../Logo';

const COLUMNS = [
  {
    title: 'Produto',
    links: [
      { label: 'Recursos', href: '#recursos', anchor: true },
      { label: 'Planos', href: '/pricing', anchor: false },
      { label: 'Como funciona', href: '#como-funciona', anchor: true },
    ],
  },
  {
    title: 'Guias',
    links: [
      { label: 'Conversor ZPL → PDF', href: '/converter-zpl-pdf', anchor: false },
      { label: 'Como imprimir ZPL', href: '/imprimir-zpl', anchor: false },
      { label: 'Etiqueta Mercado Livre', href: '/etiqueta-mercado-livre', anchor: false },
      { label: 'Imprimir em lote', href: '/imprimir-etiquetas-em-lote', anchor: false },
      { label: 'Impressora térmica', href: '/impressora-termica-mercado-livre', anchor: false },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Suporte', href: 'mailto:suporte@labelgo.com.br', anchor: false },
      { label: 'Termos', href: '/termos', anchor: false },
      { label: 'Privacidade', href: '/privacidade', anchor: false },
    ],
  },
];

export default function Footer() {
  const go = (href: string) => {
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-ink text-white/60 noise relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[300px] rounded-full bg-secondary/[0.06] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 md:gap-8">
          <div>
            <Logo variant="light" className="h-9" />
            <p className="mt-4 text-sm leading-relaxed max-w-xs">
              Simplificando seus envios para você vender mais.
            </p>
            <a
              href="mailto:suporte@labelgo.com.br"
              className="mt-5 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4" />
              suporte@labelgo.com.br
            </a>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.anchor ? (
                      <button
                        onClick={() => go(link.href)}
                        className="text-sm hover:text-white transition-colors"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <a href={link.href} className="text-sm hover:text-white transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-ink-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span>© {new Date().getFullYear()} LabelGo. Todos os direitos reservados.</span>
          <span className="text-white/35">
            LabelGo não é afiliado ao Mercado Livre.
          </span>
        </div>
      </div>
    </footer>
  );
}
