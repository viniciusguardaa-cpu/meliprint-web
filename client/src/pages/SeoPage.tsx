import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Printer, Zap, Clock, Shield, ChevronRight } from 'lucide-react';
import Header from '../components/Header';
import type { SeoPageContent } from '../content/seoPages';

type SeoPageProps = SeoPageContent & { cta?: boolean };

export default function SeoPage({ h1, lead, crumb, sections, faqs = [], related = [], cta = true }: SeoPageProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground transition-colors">Início</Link>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-foreground/80">{crumb}</span>
        </nav>

        <h1 className="text-3xl font-bold text-foreground mb-4">{h1}</h1>
        <p className="text-xl text-muted-foreground mb-8">{lead}</p>

        {sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">{section.heading}</h2>
            {section.body && (Array.isArray(section.body) ? section.body : [section.body]).map((p, j) => (
              <p key={j} className="text-muted-foreground leading-relaxed mb-3 last:mb-0">{p}</p>
            ))}
            {section.bullets && (
              <ul className="mt-3 list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
                {section.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {section.links && (
              <p className="mt-3 text-sm">
                {section.links.map((l) => (
                  <Link key={l.href} to={l.href} className="text-primary font-medium hover:underline mr-4">
                    {l.label}
                  </Link>
                ))}
              </p>
            )}
          </section>
        ))}

        {faqs.length > 0 && (
          <section className="mt-10" aria-labelledby="faq-title">
            <h2 id="faq-title" className="text-xl font-semibold text-foreground mb-4">
              Perguntas frequentes
            </h2>
            <div className="space-y-5">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold text-foreground">{f.q}</h3>
                  <p className="mt-1 text-muted-foreground leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <nav className="mt-10 border-t border-border pt-8" aria-label="Páginas relacionadas">
            <h2 className="text-lg font-semibold text-foreground mb-4">Veja também</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <li key={r.href}>
                  <Link
                    to={r.href}
                    className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                  >
                    <span className="block font-semibold text-foreground text-sm">{r.title}</span>
                    <span className="block text-muted-foreground text-sm mt-1">{r.desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {cta && (
          <div className="bg-primary rounded-2xl p-6 text-white text-center mt-8">
            <h2 className="text-xl font-bold mb-2">Pronto para imprimir sem trabalho manual?</h2>
            <p className="text-white/80 mb-4">
              Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-secondary hover:text-foreground transition-all duration-150 hover:-translate-y-px inline-flex items-center gap-2"
            >
              Testar grátis por 7 dias
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-6 text-muted-foreground text-sm">
          <div className="flex items-center gap-2"><Zap className="w-4 h-4" /> Rápido</div>
          <div className="flex items-center gap-2"><Shield className="w-4 h-4" /> Seguro</div>
          <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Sem fidelidade</div>
          <div className="flex items-center gap-2"><Printer className="w-4 h-4" /> ZPL + PDF</div>
        </div>
      </main>
    </div>
  );
}
