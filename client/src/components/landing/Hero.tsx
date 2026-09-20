import { useEffect, useRef, type CSSProperties } from 'react';
import {
  ArrowRight,
  Play,
  CheckCircle,
  Printer,
  PackageCheck,
  Zap,
} from 'lucide-react';
import Reveal from './Reveal';
import { DashboardMockup, ThermalPrinter, PackageBoxes } from './visuals';

const BENEFITS = [
  'Impressão em formato ZPL',
  'Integração com Mercado Livre',
  'Sem instalação',
  'Rápido e seguro',
];

interface HeroProps {
  priceLabel: string;
  onPrimaryCta: () => void;
}

export default function Hero({ priceLabel, onPrimaryCta }: HeroProps) {
  const rootRef = useRef<HTMLElement>(null);

  // Subtle mouse parallax — desktop pointers only, skipped for reduced motion.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', String((e.clientX - r.left) / r.width - 0.5));
      el.style.setProperty('--my', String((e.clientY - r.top) / r.height - 0.5));
    };
    const onLeave = () => {
      el.style.setProperty('--mx', '0');
      el.style.setProperty('--my', '0');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const layer = (depth: number): CSSProperties => ({
    transform: `translate3d(calc(var(--mx, 0) * ${depth}px), calc(var(--my, 0) * ${depth}px), 0)`,
    transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
  });

  const scrollToHow = () => {
    document.querySelector('#como-funciona')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden noise pt-28 sm:pt-36 lg:pt-40 pb-16 sm:pb-24"
      aria-labelledby="hero-title"
    >
      {/* Background: lime radial glow + soft blobs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-40 right-[-10%] w-[720px] h-[720px] rounded-full opacity-60 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(234,239,85,0.55) 0%, rgba(234,239,85,0) 65%)',
            transform: 'translate3d(calc(var(--mx, 0) * -24px), calc(var(--my, 0) * -24px), 0)',
            transition: 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        <div className="absolute top-1/3 left-[-15%] w-[560px] h-[560px] rounded-full bg-[#FE5D31]/[0.07] blur-3xl" />
        <div className="absolute bottom-[-20%] right-[20%] w-[420px] h-[420px] rounded-full bg-secondary/25 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-[45%_55%] gap-12 lg:gap-8 items-center">
          {/* ------- Copy ------- */}
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-black/[0.06] shadow-sm text-foreground/80 pl-2 pr-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold">
                <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                  <Printer className="w-3.5 h-3.5 text-foreground" />
                </span>
                Para vendedores do Mercado Livre
              </span>
            </Reveal>

            <Reveal delay={90}>
              <h1
                id="hero-title"
                className="mt-5 text-[42px] sm:text-6xl lg:text-[64px] xl:text-[76px] font-extrabold text-foreground leading-[0.98] tracking-tight"
              >
                Imprima etiquetas do{' '}
                <span className="text-primary">Mercado&nbsp;Livre</span>{' '}
                em segundos.
              </h1>
            </Reveal>

            <Reveal delay={180}>
              <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
                Automatize seus envios, economize tempo e foque no que realmente
                importa: fazer seu negócio crescer.
              </p>
            </Reveal>

            <Reveal delay={260}>
              <ul className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-md mx-auto lg:mx-0 text-left">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm font-medium text-foreground/85">
                    <CheckCircle className="w-[18px] h-[18px] text-success shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={340}>
              <div className="mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3.5">
                <button
                  onClick={onPrimaryCta}
                  className="btn-shine group inline-flex items-center justify-center gap-2.5 bg-primary text-white font-bold text-base px-8 py-4 rounded-2xl shadow-[0_16px_40px_-12px_rgba(254,93,49,0.55)] transition-all duration-150 hover:scale-[1.02] hover:shadow-[0_20px_48px_-12px_rgba(254,93,49,0.65)] active:scale-[0.98] min-h-[52px] w-full sm:w-auto"
                >
                  Começar agora
                  <ArrowRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1" />
                </button>
                <button
                  onClick={scrollToHow}
                  className="group inline-flex items-center justify-center gap-3 font-semibold text-foreground px-6 py-4 rounded-2xl border border-black/[0.08] bg-white/70 backdrop-blur hover:bg-white transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] min-h-[52px] w-full sm:w-auto"
                >
                  <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center transition-transform duration-150 group-hover:scale-110">
                    <Play className="w-3 h-3 fill-foreground text-foreground ml-px" />
                  </span>
                  Ver como funciona
                </button>
              </div>
            </Reveal>

            <Reveal delay={420}>
              <div className="mt-8 flex items-center justify-center lg:justify-start gap-3">
                <div className="text-left">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plano Pro</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-foreground">{priceLabel}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                </div>
                <span className="h-10 w-px bg-border mx-2" aria-hidden="true" />
                <p className="text-xs sm:text-sm text-muted-foreground text-left leading-snug">
                  7 dias grátis para testar.<br />Cancele quando quiser.
                </p>
              </div>
            </Reveal>
          </div>

          {/* ------- Product showcase ------- */}
          <Reveal delay={200} className="relative hidden md:block">
            <div className="relative">
              {/* Boxes behind */}
              <div className="absolute -bottom-6 -left-4 opacity-70" style={layer(8)}>
                <PackageBoxes />
              </div>

              {/* Main app window */}
              <div className="relative z-10" style={layer(14)}>
                <div className="animate-float-slow">
                  <DashboardMockup />
                </div>
              </div>

              {/* Thermal printer */}
              <div className="absolute -right-2 sm:-right-6 -bottom-16 w-44 sm:w-56 z-20" style={layer(24)}>
                <ThermalPrinter />
              </div>

              {/* Floating cards — illustrative product UI */}
              <div
                className="absolute -left-6 top-8 z-20"
                style={layer(30)}
              >
                <div className="animate-float bg-white/90 backdrop-blur rounded-2xl border border-black/[0.06] shadow-[0_16px_40px_-16px_rgba(16,24,39,0.3)] px-4 py-3 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                    <PackageCheck className="w-[18px] h-[18px] text-foreground" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-foreground leading-tight">15 envios prontos</div>
                    <div className="text-[11px] text-muted-foreground">para impressão</div>
                  </div>
                </div>
              </div>

              <div
                className="absolute right-4 -top-5 z-20"
                style={layer(36)}
              >
                <div className="animate-float bg-ink text-white rounded-2xl shadow-[0_16px_40px_-16px_rgba(7,17,29,0.55)] px-4 py-3 flex items-center gap-3" style={{ animationDelay: '1.2s' }}>
                  <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                    <Zap className="w-[18px] h-[18px] text-secondary" />
                  </span>
                  <div>
                    <div className="text-sm font-bold leading-tight">Impressão via ZPL</div>
                    <div className="text-[11px] text-white/60">etiqueta 10x15</div>
                  </div>
                </div>
              </div>

              <div
                className="absolute left-10 -bottom-10 z-20 hidden lg:block"
                style={layer(20)}
              >
                <div className="animate-float bg-white/90 backdrop-blur rounded-2xl border border-black/[0.06] shadow-[0_16px_40px_-16px_rgba(16,24,39,0.3)] px-4 py-3 flex items-center gap-2.5" style={{ animationDelay: '0.6s' }}>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
                  <span className="text-xs font-semibold text-foreground">Pedido → etiqueta em segundos</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Simplified product preview — mobile only */}
        <Reveal delay={300} className="md:hidden mt-12">
          <DashboardMockup compact />
        </Reveal>
      </div>
    </section>
  );
}
