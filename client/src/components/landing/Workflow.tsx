import Reveal from './Reveal';

const STEPS = [
  {
    title: 'Conecte sua conta',
    desc: 'Faça login e autorize sua conta do Mercado Livre.',
  },
  {
    title: 'Selecione os envios',
    desc: 'Escolha um ou vários pedidos.',
  },
  {
    title: 'Gere as etiquetas',
    desc: 'Processe as etiquetas em formato ZPL.',
  },
  {
    title: 'Imprima e pronto',
    desc: 'Suas etiquetas ficam prontas para uso.',
  },
];

export default function Workflow() {
  return (
    <section id="como-funciona" className="py-14 sm:py-24 scroll-mt-24" aria-labelledby="workflow-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal draw>
          <div className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-ink noise px-6 py-14 sm:p-16 lg:p-20">
            {/* glows */}
            <div className="pointer-events-none absolute -top-32 left-1/4 w-[480px] h-[480px] rounded-full bg-secondary/[0.08] blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-40 right-0 w-[420px] h-[420px] rounded-full bg-primary/[0.08] blur-3xl" aria-hidden="true" />

            <div className="relative max-w-2xl">
              <span className="text-xs font-bold tracking-[0.18em] text-secondary uppercase">Como funciona</span>
              <h2
                id="workflow-title"
                className="mt-3 text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-white tracking-tight leading-[1.05]"
              >
                Do pedido à etiqueta em poucos cliques.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-white/60">
                Um processo simples, rápido e eficiente.
              </p>
            </div>

            {/* Steps — horizontal on desktop, vertical on mobile */}
            <ol className="relative mt-12 sm:mt-16 grid gap-10 lg:gap-6 lg:grid-cols-4">
              {/* connecting line — vertical on mobile, horizontal on desktop */}
              <div
                className="draw-line-y lg:hidden absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-secondary/60 via-white/20 to-white/5"
                aria-hidden="true"
              />
              <div
                className="draw-line hidden lg:block absolute left-0 right-0 top-[27px] h-px bg-gradient-to-r from-secondary/60 via-white/20 to-white/5"
                aria-hidden="true"
              />
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="reveal-child relative flex lg:flex-col gap-5 lg:gap-0 items-start"
                  style={{ '--reveal-delay': `${200 + i * 140}ms` } as React.CSSProperties}
                >
                  <span className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl bg-ink-soft border border-ink-line text-secondary font-extrabold text-lg shrink-0 shadow-[0_0_0_6px_rgba(7,17,29,1)]">
                    {i + 1}
                  </span>
                  <div className="lg:mt-6 pt-1 lg:pt-0 lg:pr-6">
                    <h3 className="text-white font-bold text-base sm:text-lg">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-white/55 leading-relaxed">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
