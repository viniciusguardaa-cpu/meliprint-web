import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';

interface FounderOfferProps {
  /** Formatted founder price, e.g. "R$ 7,90" (complete Founder offer, from the plans API). */
  founderPriceLabel: string;
  /** Formatted regular Pro price, e.g. "R$ 19,90". */
  proPriceLabel: string;
  /** Live remaining founder slots from /api/plans; null when unknown. */
  slotsRemaining?: number | null;
  /** Total founder slots (cap), for the honest "restam X de N" line. */
  slotsCap?: number | null;
  onCta: () => void;
}

/**
 * Launch invite: 20 founder slots on the complete Founder offer with locked pricing.
 *
 * Honesty rules baked into the copy:
 * - The founder deal maps to the real complete Founder offer (batch printing, PDF/ZPL) —
 *   includes all full-plan features, including optional auto-print.
 * - "Valor travado" is true while the subscription stays active: contracted
 *   prices are snapshotted in subscription contracts and Mercado Pago keeps billing the
 *   contracted amount.
 * - Slots are counted from paid activations by the server. Trials do not
 *   consume a slot.
 */
export default function FounderOffer({
  founderPriceLabel,
  proPriceLabel,
  slotsRemaining = null,
  slotsCap = null,
  onCta,
}: FounderOfferProps) {
  const soldOut = slotsRemaining !== null && slotsRemaining <= 0;
  const slotsLine =
    !soldOut && slotsRemaining !== null && slotsCap !== null
      ? `Restam ${slotsRemaining} de ${slotsCap} vagas`
      : null;
  return (
    <section id="fundador" className="relative py-14 sm:py-24 overflow-hidden" aria-labelledby="founder-title">
      {/* warm launch gradient, matching the invite art */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-brand-wasabi/25 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-brand-wasabi/15 blur-3xl" />
      </div>

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="max-w-2xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[11px] sm:text-xs font-bold tracking-[0.18em] text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-wasabi" />
              CONVITE DE LANÇAMENTO
            </span>
            <h2
              id="founder-title"
              className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.02] text-foreground"
            >
              {soldOut ? (
                <>
                  Vagas de fundador
                  <br />
                  <span className="text-primary">esgotadas.</span>
                </>
              ) : (
                <>
                  20 vagas
                  <br />
                  <span className="text-primary">de fundador.</span>
                </>
              )}
            </h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground">
              {soldOut
                ? 'As 20 vagas da primeira turma já foram preenchidas. O LabelGo segue disponível no plano completo.'
                : 'Entre na primeira turma, use o LabelGo com valor travado e ajude a moldar o produto com seu feedback.'}
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative mt-10 max-w-3xl mx-auto overflow-hidden rounded-[28px] sm:rounded-[36px] bg-ink noise px-6 py-10 sm:p-12 shadow-[0_30px_80px_-30px_rgba(7,17,29,0.6)]">
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute -top-24 right-0 w-[320px] h-[320px] rounded-full bg-brand-wasabi/10 blur-3xl" />
            </div>

            <div className="relative flex flex-col sm:flex-row sm:items-center gap-8">
              <div className="flex-1">
                <div className="flex items-end gap-2">
                  <span className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-none">
                    {soldOut ? proPriceLabel : founderPriceLabel}
                  </span>
                </div>
                {soldOut ? (
                  <p className="mt-2 text-brand-wasabi font-semibold">/mês no plano completo</p>
                ) : (
                  <>
                    <p className="mt-2 text-brand-wasabi font-semibold">/mês, valor travado</p>
                    <p className="mt-1 text-sm text-white/40">
                      plano regular <span className="line-through">{proPriceLabel}/mês</span>
                    </p>
                  </>
                )}
                {slotsLine && (
                  <p className="mt-2 text-sm font-semibold text-brand-wasabi">{slotsLine}</p>
                )}
              </div>

              {!soldOut && (
                <div className="flex-shrink-0 self-start sm:self-center">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-brand-wasabi flex flex-col items-center justify-center text-ink shadow-[0_10px_40px_-8px_rgba(234,239,85,0.5)]">
                    <span className="text-3xl sm:text-4xl font-extrabold leading-none">20</span>
                    <span className="text-[10px] sm:text-xs font-bold tracking-widest mt-1">VAGAS</span>
                  </div>
                </div>
              )}
            </div>

            <div className="relative my-7 border-t border-dashed border-white/15" aria-hidden="true" />

            <p className="relative text-white/75 text-sm sm:text-base leading-relaxed">
              Para quem vende no <strong className="text-white font-semibold">Mercado Livre</strong>:{' '}
              {soldOut
                ? 'impressão de etiquetas em lote, em PDF ou formato para impressora térmica 10×15, direto do navegador.'
                : 'plano completo, com etiquetas em lote, PDF ou formato para impressora térmica 10×15. Preço de fundador em troca do seu feedback.'}
            </p>
            {!soldOut && (
              <p className="relative mt-3 text-xs sm:text-sm text-white/45 leading-relaxed">
                Fundador leva todos os recursos do plano completo: fila por prazo, conferência,
                histórico e impressão automática com agente opcional. Mesmo plano, preço promocional.
              </p>
            )}
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-8 text-center">
            <button
              onClick={onCta}
              className="btn-shine group inline-flex items-center justify-center gap-2.5 bg-primary text-white font-bold text-base sm:text-lg px-10 py-4 rounded-2xl shadow-[0_20px_50px_-12px_rgba(254,93,49,0.55)] transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] min-h-[56px]"
            >
              {soldOut ? 'CONHECER O PLANO COMPLETO' : 'QUERO SER FUNDADOR'}
              <ArrowRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1" />
            </button>
            {!soldOut && (
              <p className="mt-4 text-xs sm:text-sm text-muted-foreground">
                São 7 dias grátis para testar. Valor travado enquanto a assinatura estiver ativa.
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
