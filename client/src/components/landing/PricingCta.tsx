import { ArrowRight, Check } from 'lucide-react';
import Reveal from './Reveal';
import { PackageBoxes, ShippingLabel } from './visuals';

const BENEFITS = [
  'Impressões ilimitadas',
  'Suporte por e-mail',
  'Cancele quando quiser',
  '7 dias grátis para testar',
];

interface PricingCtaProps {
  priceLabel: string;
  onCta: () => void;
}

export default function PricingCta({ priceLabel, onCta }: PricingCtaProps) {
  return (
    <section id="planos" className="py-14 sm:py-24 scroll-mt-24" aria-labelledby="pricing-title">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] sm:rounded-[44px] bg-ink noise px-6 py-16 sm:p-16 lg:p-24 text-center">
            {/* glows + dressing */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-secondary/[0.12] blur-3xl" />
              <div className="absolute bottom-[-30%] left-[-8%] w-[380px] h-[380px] rounded-full bg-primary/[0.1] blur-3xl" />
              <div className="absolute bottom-8 left-8 hidden lg:block opacity-40">
                <PackageBoxes tone="dark" />
              </div>
              <ShippingLabel className="absolute bottom-10 right-10 w-28 rotate-[8deg] opacity-25 hidden lg:block" />
              <ShippingLabel className="absolute top-10 right-24 w-24 -rotate-[10deg] opacity-15 hidden lg:block" />
            </div>

            <div className="relative max-w-2xl mx-auto">
              <h2
                id="pricing-title"
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.05]"
              >
                Mais tempo para o que realmente importa.
              </h2>
              <p className="mt-5 text-base sm:text-lg text-white/60">
                Impressões ilimitadas, suporte e cancelamento quando quiser.
              </p>

              <div className="mt-10 flex items-end justify-center gap-2">
                <span className="text-5xl sm:text-7xl font-extrabold text-white tracking-tight">
                  {priceLabel}
                </span>
                <span className="text-white/50 text-lg pb-1.5 sm:pb-2.5">/mês</span>
              </div>

              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                {BENEFITS.map((b) => (
                  <li key={b} className="inline-flex items-center gap-2 text-sm text-white/75">
                    <span className="w-5 h-5 rounded-full bg-secondary/15 flex items-center justify-center">
                      <Check className="w-3 h-3 text-secondary" />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>

              <button
                onClick={onCta}
                className="btn-shine group mt-10 inline-flex items-center justify-center gap-2.5 bg-primary text-white font-bold text-base sm:text-lg px-10 py-4 rounded-2xl shadow-[0_20px_50px_-12px_rgba(254,93,49,0.55)] transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] min-h-[56px]"
              >
                Começar agora
                <ArrowRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
