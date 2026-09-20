import { CheckSquare, Printer, RefreshCw } from 'lucide-react';
import Logo from '../Logo';
import MarketplaceLogo from '../MarketplaceLogo';
import { cn } from '../../lib/utils';

/**
 * Pure CSS/SVG product illustrations used across the landing page.
 * They mirror the real LabelGo dashboard UI (shipments table, account pills,
 * print button) — all data shown is illustrative interface content.
 */

const DEMO_ROWS = [
  { id: '4829173', buyer: 'marcos.rj', items: '2x Fone bluetooth', city: 'São Paulo, SP' },
  { id: '4829158', buyer: 'loja_luna', items: '1x Camiseta oversize', city: 'Curitiba, PR' },
  { id: '4829141', buyer: 'bruno.m', items: '3x Capinha iPhone', city: 'Belo Horizonte, MG' },
];

/** Browser window framing the LabelGo shipments UI (miniaturized). */
export function DashboardMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_24px_60px_-24px_rgba(16,24,39,0.25)] overflow-hidden text-left">
      {/* Browser chrome */}
      <div className="bg-[#F2F1EC] px-4 py-2.5 flex items-center gap-3 border-b border-black/[0.06]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="hidden sm:flex flex-1 justify-center">
          <div className="bg-white/80 rounded-md px-4 py-1 text-[10px] text-muted-foreground font-medium tracking-wide">
            labelgo.com.br/dashboard
          </div>
        </div>
      </div>

      {/* App bar */}
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-b border-border bg-surface">
        <Logo className="h-4 sm:h-5" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2 py-0.5 text-[10px] font-medium text-foreground">
          <MarketplaceLogo provider="mercadolivre" size={14} />
          Mercado Livre
        </span>
      </div>

      {/* Toolbar */}
      <div className="px-4 sm:px-5 pt-3.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-muted-foreground border border-border rounded-lg px-2.5 py-1.5">
          <CheckSquare className="w-3.5 h-3.5 text-primary" />
          Selecionar todos
        </span>
        <span className="inline-flex items-center gap-1.5 bg-primary text-white rounded-lg px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold shadow-sm">
          <Printer className="w-3.5 h-3.5" />
          Imprimir (3)
        </span>
      </div>

      {/* Shipments table */}
      <div className="px-4 sm:px-5 py-3.5">
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-[24px_1fr_auto] sm:grid-cols-[24px_90px_1fr_auto_auto] items-center gap-x-3 px-3 py-2 bg-muted text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span />
            <span>Envio</span>
            <span className="hidden sm:block">Comprador</span>
            <span className="hidden sm:block">Destino</span>
            <span>Status</span>
          </div>
          {DEMO_ROWS.slice(0, compact ? 2 : 3).map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[24px_1fr_auto] sm:grid-cols-[24px_90px_1fr_auto_auto] items-center gap-x-3 px-3 py-2.5 border-t border-border bg-secondary/20"
            >
              <CheckSquare className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground">#{row.id}</span>
              <span className="hidden sm:block text-[11px] font-medium text-foreground truncate">{row.buyer}</span>
              <span className="hidden sm:block text-[10px] text-muted-foreground">{row.city}</span>
              <span className="bg-success/15 text-green-800 px-2 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap">
                Pronto
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 10x15 thermal shipping label (illustrative). */
export function ShippingLabel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-white rounded-md border border-black/10 shadow-sm p-3 flex flex-col gap-2 select-none',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between border-b border-dashed border-black/15 pb-1.5">
        <span className="text-[8px] font-bold tracking-widest text-foreground/80 uppercase">Etiqueta de envio</span>
        <span className="text-[8px] font-mono text-muted-foreground">10x15</span>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 w-3/4 rounded-full bg-foreground/15" />
        <div className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
      </div>
      <div className="barcode h-8 w-full rounded-[2px]" />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[7px] tracking-[0.2em] text-foreground/70">MLB 4829 1730</span>
        <span className="font-mono text-[7px] tracking-[0.2em] text-foreground/70">BR</span>
      </div>
    </div>
  );
}

/** Stylized thermal printer feeding a label. */
export function ThermalPrinter({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)} aria-hidden="true">
      {/* Printed label coming out of the slot */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[52%] w-[62%] animate-label-feed">
        <ShippingLabel className="shadow-md" />
      </div>
      {/* Printer body */}
      <div className="relative rounded-[22px] bg-gradient-to-b from-[#232B3A] to-[#101827] shadow-[0_30px_60px_-20px_rgba(7,17,29,0.55)] px-6 pt-5 pb-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-dot" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
          </div>
          <Printer className="w-4 h-4 text-white/40" />
        </div>
        {/* Label slot */}
        <div className="mt-4 h-2.5 rounded-full bg-black/60 shadow-inner" />
      </div>
    </div>
  );
}

/** Tilted smartphone showing the mobile dashboard UI. */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative w-[240px] sm:w-[270px] rounded-[38px] bg-ink p-2.5 shadow-[0_50px_100px_-30px_rgba(7,17,29,0.6)] rotate-[6deg]',
        className
      )}
      aria-hidden="true"
    >
      <div className="rounded-[30px] bg-[#FFFDF8] overflow-hidden">
        {/* Notch */}
        <div className="relative pt-3 pb-2 flex justify-center">
          <span className="w-20 h-5 rounded-full bg-ink" />
        </div>
        <div className="px-3.5 pb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <Logo className="h-3.5" />
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted pl-1 pr-1.5 py-0.5 text-[8px] font-medium">
            <MarketplaceLogo provider="mercadolivre" size={12} />
            Mercado Livre
          </span>
          {DEMO_ROWS.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-white p-2.5 flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-semibold text-foreground truncate">{row.buyer}</div>
                <div className="text-[8px] text-muted-foreground truncate">{row.items}</div>
              </div>
              <span className="bg-success/15 text-green-800 px-1.5 py-0.5 rounded-full text-[7px] font-semibold">
                Pronto
              </span>
            </div>
          ))}
          <div className="rounded-xl bg-primary text-white text-center py-2.5 text-[10px] font-bold">
            Imprimir (3)
          </div>
        </div>
      </div>
    </div>
  );
}

function CardboardBox({ size, tone = 'light' }: { size: number; tone?: 'light' | 'dark' }) {
  const top = tone === 'light' ? '#E7D9BE' : '#8A744E';
  const side = tone === 'light' ? '#D8C5A0' : '#6E5B3C';
  const tape = tone === 'light' ? '#C4AF86' : '#57482F';
  return (
    <div className="relative rounded-[4px]" style={{ width: size, height: size * 0.78, background: `linear-gradient(180deg, ${top} 0%, ${top} 42%, ${side} 42%, ${side} 100%)` }}>
      {/* tape strip */}
      <span className="absolute left-1/2 top-0 -translate-x-1/2 h-full" style={{ width: size * 0.16, background: tape }} />
      {/* label on the box */}
      <span className="absolute right-[8%] bottom-[14%] w-[30%] h-[24%] rounded-[2px] bg-white/90 border border-black/10" />
    </div>
  );
}

/** Discreet shipping boxes used as background dressing. */
export function PackageBoxes({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <div className={cn('flex items-end gap-2.5 sm:gap-3', className)} aria-hidden="true">
      <CardboardBox size={56} tone={tone} />
      <CardboardBox size={84} tone={tone} />
      <CardboardBox size={40} tone={tone} />
    </div>
  );
}
