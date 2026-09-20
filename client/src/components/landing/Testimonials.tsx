import { Quote, Star } from 'lucide-react';
import Reveal from './Reveal';

/**
 * Testimonials section — visual structure only. No real customer quotes
 * exist in the project yet, so the cards render as clearly-marked
 * demonstration slots instead of invented names/photos/ratings.
 */
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
          {[0, 1, 2].map((i) => (
            <Reveal key={i} delay={i * 100} className="min-w-[82%] sm:min-w-[60%] lg:min-w-0 snap-center">
              <figure className="h-full rounded-[28px] border-2 border-dashed border-black/[0.09] bg-white/60 p-7 sm:p-8 flex flex-col">
                {/* stars — structural placeholder */}
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 text-black/[0.12]" />
                  ))}
                </div>
                <blockquote className="mt-5 flex-1 flex flex-col items-start justify-center gap-4 text-left">
                  <Quote className="w-8 h-8 text-black/[0.1]" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground/70 italic">
                    Espaço reservado para depoimento de cliente.
                  </p>
                </blockquote>
                <figcaption className="mt-6 pt-5 border-t border-black/[0.06] flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-black/[0.06]" aria-hidden="true" />
                  <span>
                    <span className="block h-2.5 w-24 rounded-full bg-black/[0.08]" aria-hidden="true" />
                    <span className="mt-1.5 block h-2 w-16 rounded-full bg-black/[0.05]" aria-hidden="true" />
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={150} className="text-center">
          <p className="text-xs text-muted-foreground/60 italic">
            Seção em demonstração — depoimentos reais serão publicados aqui.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
