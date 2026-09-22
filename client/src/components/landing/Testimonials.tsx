import { Quote, Star } from 'lucide-react';
import Reveal from './Reveal';

const TESTIMONIALS = [
  {
    quote:
      'Antes eu abria pedido por pedido para gerar etiqueta. Agora seleciono os envios prontos e imprimo tudo de uma vez em PDF.',
    name: 'Mariana S.',
    role: 'Loja de cosméticos · Mercado Livre',
    initials: 'MS',
  },
  {
    quote:
      'Uso impressora térmica e o arquivo ZPL funcionou de primeira. A expedição ficou muito mais organizada.',
    name: 'Diego R.',
    role: 'Eletrônicos e acessórios · Mercado Livre',
    initials: 'DR',
  },
  {
    quote:
      'No Pro a etiqueta sai automática quando entra pedido, direto na impressora. Nos dias de pico faz muita diferença.',
    name: 'Fernanda L.',
    role: 'Moda infantil · Mercado Livre',
    initials: 'FL',
  },
];

export default function Testimonials() {
  return (
    <section id="depoimentos" className="py-16 sm:py-24 bg-[#F7F8F5] scroll-mt-24" aria-labelledby="testimonials-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto">
          <h2
            id="testimonials-title"
            className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]"
          >
            Quem usa, recomenda.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            Histórias de vendedores que simplificaram a expedição com o LabelGo.
          </p>
        </Reveal>

        <div className="mt-10 sm:mt-14 flex lg:grid lg:grid-cols-3 gap-4 sm:gap-6 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100} className="min-w-[82%] sm:min-w-[60%] lg:min-w-0 snap-center">
              <figure className="h-full rounded-[28px] border border-black/[0.06] bg-white shadow-[0_10px_36px_-18px_rgba(16,24,39,0.14)] p-7 sm:p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgba(16,24,39,0.22)]">
                <div className="flex gap-1" role="img" aria-label="Avaliação: 5 de 5 estrelas">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-warning text-warning" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="mt-5 flex-1 flex flex-col items-start gap-4 text-left">
                  <Quote className="w-8 h-8 text-primary" aria-hidden="true" />
                  <p className="text-sm sm:text-[15px] leading-relaxed text-foreground/80">
                    “{t.quote}”
                  </p>
                </blockquote>
                <figcaption className="mt-6 pt-5 border-t border-black/[0.06] flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-full bg-secondary/70 flex items-center justify-center text-xs font-bold text-foreground shrink-0"
                    aria-hidden="true"
                  >
                    {t.initials}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
