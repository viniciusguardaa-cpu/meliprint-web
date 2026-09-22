import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Reveal from './Reveal';
import { cn } from '../../lib/utils';
import { LANDING_FAQS } from '../../content/landingFaq';

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="duvidas" className="py-16 sm:py-24 scroll-mt-24" aria-labelledby="faq-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-[40%_60%] gap-10 lg:gap-16">
          <Reveal>
            <span className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
              Dúvidas frequentes
            </span>
            <h2
              id="faq-title"
              className="mt-3 text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]"
            >
              Ainda tem dúvidas?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Tudo o que você precisa saber antes de começar. Se restar alguma
              pergunta, fale com a gente em{' '}
              <a href="mailto:suporte@labelgo.com.br" className="text-primary font-medium hover:underline">
                suporte@labelgo.com.br
              </a>
              .
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
              {LANDING_FAQS.map((item, i) => {
                const open = openIndex === i;
                return (
                  <div key={item.q}>
                    <button
                      onClick={() => setOpenIndex(open ? null : i)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-button-${i}`}
                      className="w-full flex items-center justify-between gap-4 py-5 sm:py-6 text-left group"
                    >
                      <span className="text-base sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.q}
                      </span>
                      <span
                        className={cn(
                          'w-9 h-9 shrink-0 rounded-full border border-black/[0.08] flex items-center justify-center transition-all duration-300',
                          open ? 'bg-secondary border-secondary rotate-180' : 'bg-transparent'
                        )}
                      >
                        <ChevronDown className="w-4 h-4 text-foreground" />
                      </span>
                    </button>
                    <div
                      id={`faq-panel-${i}`}
                      role="region"
                      aria-labelledby={`faq-button-${i}`}
                      className="accordion-panel"
                      data-open={open}
                    >
                      <div>
                        <p className="pb-6 pr-10 text-sm sm:text-base text-muted-foreground leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
