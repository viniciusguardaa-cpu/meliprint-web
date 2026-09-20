import { ShieldCheck, Zap, TrendingUp, CheckCircle } from 'lucide-react';
import Reveal from './Reveal';

const ITEMS = [
  { icon: Zap, label: 'Mais agilidade' },
  { icon: CheckCircle, label: 'Menos erros' },
  { icon: TrendingUp, label: 'Mais produtividade' },
  { icon: ShieldCheck, label: 'Seguro e confiável' },
];

export default function TrustBar() {
  return (
    <section className="relative py-12 sm:py-16 border-y border-black/[0.05] bg-[#F7F8F5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <Reveal>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground/85">
            Feito para simplificar a rotina de quem vende online.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {ITEMS.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="w-4 h-4 text-foreground/60" />
                {label}
              </span>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200}>
          <p className="mt-7 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground/80 bg-white border border-black/[0.05] rounded-full px-4 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            Conexão via OAuth Mercado Livre
          </p>
        </Reveal>
      </div>
    </section>
  );
}
