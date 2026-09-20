import { ArrowRight, PackageCheck, Timer, MousePointerClick } from 'lucide-react';
import Reveal from './Reveal';
import { PackageBoxes, ShippingLabel, ThermalPrinter } from './visuals';

/**
 * Editorial/campaign section — a stylized packing-bench scene built with CSS
 * (boxes, thermal printer, label), plus an overlay card.
 */
export default function LogisticsEditorial({ onCta }: { onCta: () => void }) {
  return (
    <section className="py-14 sm:py-24" aria-labelledby="editorial-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-[#F1EBDD] min-h-[420px] sm:min-h-[480px] noise">
            {/* warm light */}
            <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-white/70 blur-3xl" aria-hidden="true" />
            <div className="absolute -bottom-32 right-10 w-[380px] h-[380px] rounded-full bg-secondary/40 blur-3xl" aria-hidden="true" />

            {/* Packing bench scene */}
            <div className="absolute inset-x-0 bottom-0 h-[62%]" aria-hidden="true">
              {/* table surface */}
              <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-[#D9CBB0] to-[#C3B091] border-t border-black/10" />
              {/* boxes on the table */}
              <div className="absolute bottom-[46%] left-[6%] sm:left-[10%]">
                <PackageBoxes />
              </div>
              <div className="absolute bottom-[30%] left-[26%] sm:left-[30%] hidden sm:block opacity-90">
                <PackageBoxes tone="dark" />
              </div>
              {/* printer on the right */}
              <div className="absolute bottom-[34%] right-[4%] sm:right-[8%] w-40 sm:w-56">
                <ThermalPrinter />
              </div>
              {/* loose labels */}
              <ShippingLabel className="absolute bottom-[12%] left-[42%] w-24 rotate-[-8deg] opacity-90 hidden sm:block" />
              <ShippingLabel className="absolute bottom-[6%] left-[55%] w-20 rotate-[6deg] opacity-80 hidden md:block" />
            </div>

            {/* Overlay card */}
            <div className="relative p-6 sm:p-12 lg:p-16">
              <div className="max-w-md bg-white/85 backdrop-blur-md rounded-[28px] border border-white/60 shadow-[0_24px_60px_-24px_rgba(16,24,39,0.3)] p-7 sm:p-9">
                <h2
                  id="editorial-title"
                  className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-[1.05]"
                >
                  Do clique ao envio.
                </h2>
                <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                  Menos tempo no operacional.<br />Mais tempo para vender.
                </p>
                <button
                  onClick={onCta}
                  className="btn-shine group mt-6 inline-flex items-center gap-2 bg-ink text-white font-semibold text-sm px-6 py-3.5 rounded-2xl transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Começar agora
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Secondary content */}
        <div className="mt-10 sm:mt-14 grid sm:grid-cols-[1fr_auto] items-center gap-6 sm:gap-12">
          <Reveal>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Agilidade que faz diferença.
            </h3>
          </Reveal>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {[
              { icon: MousePointerClick, text: 'Impressão em poucos cliques' },
              { icon: Timer, text: 'Fila por prazo de despacho no Pro' },
              { icon: PackageCheck, text: 'Conferência de itens antes de imprimir' },
            ].map(({ icon: Icon, text }, i) => (
              <Reveal key={text} delay={i * 100}>
                <span className="inline-flex items-center gap-2.5 text-sm font-medium text-foreground/80">
                  <span className="w-8 h-8 rounded-xl bg-secondary/60 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-foreground" />
                  </span>
                  {text}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
