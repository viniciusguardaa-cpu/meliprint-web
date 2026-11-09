import { describe, expect, it } from 'vitest';
import { calculateLabelCost } from '../labelCost';

const base = {
  labelsPerMonth: 100,
  thermalLabelCost: 0.12,
  paperCostPerSheet: 0.1,
  inkCostPerPage: 0.2,
  labelsPerSheet: 1,
};

describe('calculateLabelCost', () => {
  it('calcula o custo na térmica', () => {
    const result = calculateLabelCost({ ...base, printerType: 'thermal' });
    expect(result.costPerLabel).toBeCloseTo(0.12);
    expect(result.monthlyCost).toBeCloseTo(12);
    expect(result.yearlyCost).toBeCloseTo(144);
  });

  it('calcula o custo na impressora comum com etiquetas por folha', () => {
    const result = calculateLabelCost({ ...base, printerType: 'common', labelsPerSheet: 2 });
    expect(result.costPerLabel).toBeCloseTo(0.15);
    expect(result.monthlyCost).toBeCloseTo(15);
  });

  it('protege contra valores zero ou negativos', () => {
    const result = calculateLabelCost({
      printerType: 'thermal',
      labelsPerMonth: -5,
      thermalLabelCost: -1,
      paperCostPerSheet: 0,
      inkCostPerPage: 0,
      labelsPerSheet: 0,
    });
    expect(result.costPerLabel).toBe(0);
    expect(result.monthlyCost).toBe(0);
    expect(result.yearlyCost).toBe(0);
  });
});
