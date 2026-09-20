import {
  CheckSquare,
  RefreshCw,
  ShieldCheck,
  Lock,
  Printer,
  Check,
  Layers,
} from 'lucide-react';
import Reveal from './Reveal';
import { ShippingLabel } from './visuals';
import { cn } from '../../lib/utils';

const CARD_LIGHT =
  'bg-white border border-black/[0.06] shadow-[0_10px_36px_-18px_rgba(16,24,39,0.14)]';
const CARD_DARK =
  'bg-ink border border-ink-line text-white shadow-[0_10px_36px_-18px_rgba(7,17,29,0.5)]';

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-[28px] p-6 sm:p-7 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgba(16,24,39,0.22)]',
        className
      )}
    >
      {children}
    </div>
  );
}

function CardTitle({ dark, title, desc }: { dark?: boolean; title: string; desc: string }) {
  return (
    <div className="relative z-10">
      <h3 className={cn('text-lg sm:text-xl font-bold', dark ? 'text-white' : 'text-foreground')}>
        {title}
      </h3>
      <p className={cn('mt-1.5 text-sm leading-relaxed', dark ? 'text-white/60' : 'text-muted-foreground')}>
        {desc}
      </p>
    </div>
  );
}

export default function BentoFeatures() {
  return (
    <section id="recursos" className="py-16 sm:py-24 scroll-mt-24" aria-labelledby="features-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-xs font-bold tracking-[0.18em] text-primary uppercase">Recursos</span>
          <h2
            id="features-title"
            className="mt-3 text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]"
          >
            Tudo o que você precisa em um só lugar.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            Ferramentas para simplificar sua operação e acelerar seus envios.
          </p>
        </Reveal>

        <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Impressão instantânea — tall */}
          <Reveal className="lg:col-span-5 lg:row-span-2">
            <Card className={cn(CARD_LIGHT, 'h-full flex flex-col')}>
              <CardTitle
                title="Impressão instantânea"
                desc="Gere etiquetas em segundos e imprima pelo navegador — PDF ou ZPL, sem instalar nada."
              />
              <div className="relative flex-1 mt-6 min-h-[220px]">
                <div className="absolute inset-x-6 top-2 bottom-0 rounded-t-2xl bg-muted/80 border border-b-0 border-black/[0.05]" />
                <ShippingLabel className="absolute left-1/2 -translate-x-1/2 top-6 w-44 sm:w-52 rotate-[-4deg] transition-transform duration-500 group-hover:rotate-[-2deg] group-hover:-translate-y-1" />
                <ShippingLabel className="absolute left-1/2 -translate-x-1/2 top-14 w-44 sm:w-52 rotate-[3deg] opacity-90 transition-transform duration-500 group-hover:rotate-[5deg]" />
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 bg-ink text-white text-[10px] font-semibold px-3 py-1.5 rounded-full">
                  <Printer className="w-3 h-3 text-secondary" />
                  ZPL · PDF · 10x15
                </span>
              </div>
            </Card>
          </Reveal>

          {/* Seleção em lote — dark, wide */}
          <Reveal delay={80} className="lg:col-span-7">
            <Card className={cn(CARD_DARK, 'h-full')}>
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
              <CardTitle
                dark
                title="Seleção em lote"
                desc="Selecione vários envios de uma vez e imprima todos juntos — ideal para dias de muitas vendas."
              />
              <div className="mt-6 space-y-2">
                {['#4829173', '#4829158', '#4829141'].map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-xl bg-ink-card border border-ink-line px-3.5 py-2.5 transition-transform duration-300 group-hover:translate-x-1"
                  >
                    <CheckSquare className="w-4 h-4 text-secondary shrink-0" />
                    <span className="font-mono text-xs text-white/70">{id}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-white/10" />
                    <span className="text-[10px] font-semibold text-secondary">Pronto</span>
                  </div>
                ))}
                <div className="pt-1 flex justify-end">
                  <span className="inline-flex items-center gap-1.5 bg-primary text-white text-[11px] font-bold px-3.5 py-2 rounded-xl">
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir selecionados
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* Sincronização automática */}
          <Reveal delay={140} className="lg:col-span-3">
            <Card className={cn(CARD_LIGHT, 'h-full')}>
              <div className="w-11 h-11 rounded-2xl bg-secondary/70 flex items-center justify-center mb-5 transition-transform duration-500 group-hover:rotate-90">
                <RefreshCw className="w-5 h-5 text-foreground" />
              </div>
              <CardTitle
                title="Sincronização automática"
                desc="Seus envios chegam do Mercado Livre sem você precisar atualizar."
              />
              <p className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
                Sincronizado agora
              </p>
            </Card>
          </Reveal>

          {/* Conexão segura */}
          <Reveal delay={200} className="lg:col-span-4">
            <Card className={cn(CARD_LIGHT, 'h-full')}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-success/15 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                  <ShieldCheck className="w-5 h-5 text-green-700" />
                </div>
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <CardTitle
                title="Conexão segura"
                desc="Você autoriza no site do Mercado Livre via OAuth. Sua senha nunca passa pelo LabelGo."
              />
            </Card>
          </Reveal>

          {/* Imprima várias etiquetas — wide */}
          <Reveal delay={120} className="lg:col-span-8">
            <Card className={cn(CARD_LIGHT, 'h-full')}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 h-full">
                <div className="sm:w-64 shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle
                    title="Imprima várias etiquetas"
                    desc="Um clique para despachar o dia inteiro de vendas."
                  />
                </div>
                <div className="relative flex-1 h-36 sm:h-full min-h-[130px]" aria-hidden="true">
                  {['-rotate-[8deg]', '-rotate-[3deg]', 'rotate-[3deg]', 'rotate-[8deg]'].map((rot, i) => (
                    <div
                      key={i}
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 transition-transform duration-500 group-hover:-translate-y-[calc(50%+8px)]',
                        rot
                      )}
                      style={{ left: `${i * 22}%`, zIndex: i }}
                    >
                      <ShippingLabel className="w-24 sm:w-28" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </Reveal>

          {/* Seguro e confiável — dark */}
          <Reveal delay={180} className="lg:col-span-4">
            <Card className={cn(CARD_DARK, 'h-full')}>
              <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
              <CardTitle dark title="Seguro e confiável" desc="" />
              <ul className="mt-4 space-y-3">
                {['Conexão segura', 'Dados protegidos', 'Infraestrutura confiável'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/80">
                    <span className="w-5 h-5 rounded-full bg-secondary/15 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-secondary" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
