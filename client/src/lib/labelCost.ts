export type PrinterType = 'thermal' | 'common';

export interface LabelCostInput {
  printerType: PrinterType;
  labelsPerMonth: number;
  /** Custo da mídia (etiqueta) na térmica, por unidade. */
  thermalLabelCost: number;
  /** Custo da folha (A4 comum ou adesiva), por folha. */
  paperCostPerSheet: number;
  /** Custo de tinta/toner por página impressa. */
  inkCostPerPage: number;
  /** Quantas etiquetas cabem em uma folha. */
  labelsPerSheet: number;
}

export interface LabelCostResult {
  costPerLabel: number;
  monthlyCost: number;
  yearlyCost: number;
}

/**
 * Custo estimado de consumíveis por etiqueta.
 *
 * - Térmica: custo da mídia (etiqueta) por unidade.
 * - Comum: (papel + tinta por página) / etiquetas por folha.
 *
 * Não inclui o preço da impressora nem manutenção — a página explica que
 * esses custos podem ser diluídos separadamente.
 */
export function calculateLabelCost(input: LabelCostInput): LabelCostResult {
  const labelsPerMonth = Math.max(0, Number(input.labelsPerMonth) || 0);
  const costPerLabel =
    input.printerType === 'thermal'
      ? Math.max(0, Number(input.thermalLabelCost) || 0)
      : (Math.max(0, Number(input.paperCostPerSheet) || 0) +
          Math.max(0, Number(input.inkCostPerPage) || 0)) /
        Math.max(1, Number(input.labelsPerSheet) || 1);

  const monthlyCost = costPerLabel * labelsPerMonth;
  return {
    costPerLabel,
    monthlyCost,
    yearlyCost: monthlyCost * 12,
  };
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
