import { MousePointerClick, Printer, RefreshCw, ListChecks } from 'lucide-react';
import Reveal from './Reveal';
import { PhoneMockup } from './visuals';

const FLOATING = [
  { icon: MousePointerClick, label: 'Menos etapas' },
  { icon: Printer, label: 'Impressão rápida' },
  { icon: RefreshCw, label: 'Pedidos sincronizados' },
  { icon: ListChecks, label: 'Processo simplificado' },
];

export default function ProductStory() {
  return (
    <section className="py-16 sm:py-24 overflow-hidden" aria-labelledby="story-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
          {/* Visual — tilted phone with lime glow */}
          <Reveal className="relative flex justify-center lg:justify-start order-last lg:order-first">
            <div className="relative">
              <div
                className="absolute inset-0 scale-125 rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(234,239,85,0.5) 0%, rgba(234,239,85,0) 65%)' }}
                aria-hidden="true"
              />
              <div className="relative animate-float-slow">
                <PhoneMockup />
              </div>
              {FLOATING.map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  className="absolute animate-float bg-white/90 backdrop-blur rounded-2xl border border-black/[0.06] shadow-[0_14px_36px_-14px_rgba(16,24,39,0.28)] px-3.5 py-2.5 flex items-center gap-2.5"
                  style={{
                    animationDelay: `${i * 0.9}s`,
                    ...(i === 0 && { top: '8%', left: '-6%' }),
                    ...(i === 1 && { top: '32%', right: '-14%' }),
                    ...(i === 2 && { bottom: '28%', left: '-12%' }),
                    ...(i === 3 && { bottom: '6%', right: '-4%' }),
                  }}
                >
                  <span className="w-7 h-7 rounded-lg bg-secondary/70 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-foreground" />
                  </span>
                  <span className="text-xs font-semibold text-foreground whitespace-nowrap">{label}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Copy */}
          <div>
            <Reveal>
              <span className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
                Resultados na rotina
              </span>
              <h2
                id="story-title"
                className="mt-3 text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]"
              >
                Mais vendas. Menos trabalho operacional.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                O LabelGo reduz o tempo gasto no processamento de etiquetas e
                simplifica a rotina operacional: os envios do Mercado Livre
                aparecem prontos para imprimir, você seleciona, gera e despacha —
                tudo no mesmo painel.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <ul className="mt-7 space-y-4">
                {[
                  'Envios prontos para impressão organizados em uma única tela',
                  'Separação entre novos envios e reimpressões',
                  'Funciona no navegador, no computador ou no celular',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-foreground/85 text-sm sm:text-base">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
                        <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
