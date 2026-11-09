import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, Info, Printer, Zap } from 'lucide-react';
import Header from '../components/Header';
import { calculateLabelCost, formatBRL } from '../lib/labelCost';
import { CALCULATOR_FAQS } from '../content/calculatorFaq';

const DEFAULTS = {
  thermalLabelCost: 0.12,
  paperCostPerSheet: 0.05,
  inkCostPerPage: 0.15,
  labelsPerSheet: 1,
  labelsPerMonth: 100,
};

function MoneyInput({
  label,
  value,
  onChange,
  step = 0.01,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-1">{label}</span>
      <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors">
        <span className="pl-3 text-sm text-muted-foreground">R$</span>
        <input
          type="number"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground focus:outline-none"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export default function LabelCostCalculator() {
  const [thermalLabelCost, setThermalLabelCost] = useState(DEFAULTS.thermalLabelCost);
  const [paperCostPerSheet, setPaperCostPerSheet] = useState(DEFAULTS.paperCostPerSheet);
  const [inkCostPerPage, setInkCostPerPage] = useState(DEFAULTS.inkCostPerPage);
  const [labelsPerSheet, setLabelsPerSheet] = useState(DEFAULTS.labelsPerSheet);
  const [labelsPerMonth, setLabelsPerMonth] = useState(DEFAULTS.labelsPerMonth);

  const base = {
    labelsPerMonth,
    thermalLabelCost,
    paperCostPerSheet,
    inkCostPerPage,
    labelsPerSheet,
  };
  const thermal = calculateLabelCost({ ...base, printerType: 'thermal' });
  const common = calculateLabelCost({ ...base, printerType: 'common' });
  const cheaper = thermal.costPerLabel <= common.costPerLabel ? 'thermal' : 'common';

  const scenarios = [50, 200, 500].map((volume) => {
    const t = calculateLabelCost({ ...base, labelsPerMonth: volume, printerType: 'thermal' });
    const c = calculateLabelCost({ ...base, labelsPerMonth: volume, printerType: 'common' });
    return { volume, thermal: t.monthlyCost, common: c.monthlyCost };
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Início</Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground/80">Calculadora de custo</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calculator className="w-5 h-5" />
          </span>
          <h1 className="text-3xl font-bold text-foreground">Calculadora de custo por etiqueta</h1>
        </div>
        <p className="text-lg text-muted-foreground mb-8">
          Compare o custo de consumíveis por etiqueta na impressora térmica e na impressora comum.
          Informe seus preços e o volume mensal para ver o custo real do despacho.
        </p>

        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
          <section className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Seus números</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-foreground mb-1">Etiquetas por mês</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={Number.isFinite(labelsPerMonth) ? labelsPerMonth : 0}
                  onChange={(e) => setLabelsPerMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </label>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <Zap className="w-4 h-4 text-primary" /> Impressora térmica
                </p>
                <MoneyInput
                  label="Custo da etiqueta 10x15"
                  value={thermalLabelCost}
                  onChange={setThermalLabelCost}
                  hint="Preço do rolo dividido pela quantidade de etiquetas."
                />
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <Printer className="w-4 h-4 text-primary" /> Impressora comum
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <MoneyInput label="Papel por folha" value={paperCostPerSheet} onChange={setPaperCostPerSheet} />
                  <MoneyInput label="Tinta/toner por página" value={inkCostPerPage} onChange={setInkCostPerPage} />
                </div>
                <label className="mt-3 block">
                  <span className="block text-sm font-medium text-foreground mb-1">Etiquetas por folha</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Number.isFinite(labelsPerSheet) ? labelsPerSheet : 1}
                    onChange={(e) => setLabelsPerSheet(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                  />
                </label>
              </div>
            </div>
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Estimativa de consumíveis. Não inclui o preço da impressora nem manutenção.
            </p>
          </section>

          <section aria-labelledby="result-title">
            <h2 id="result-title" className="text-lg font-semibold text-foreground mb-4">Resultado</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
              {[
                { key: 'thermal', label: 'Térmica', data: thermal, icon: Zap },
                { key: 'common', label: 'Comum', data: common, icon: Printer },
              ].map(({ key, label, data, icon: Icon }) => (
                <div
                  key={key}
                  className={`rounded-2xl border p-5 ${
                    cheaper === key ? 'border-primary bg-primary/5' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Icon className="w-4 h-4 text-primary" /> {label}
                    </span>
                    {cheaper === key && (
                      <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                        Mais barato
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-bold text-foreground">{formatBRL(data.costPerLabel)}</p>
                  <p className="text-sm text-muted-foreground">por etiqueta</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatBRL(data.monthlyCost)}/mês · {formatBRL(data.yearlyCost)}/ano
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-10" aria-labelledby="scenarios-title">
          <h2 id="scenarios-title" className="text-xl font-semibold text-foreground mb-4">
            Comparativo por volume
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold text-foreground py-2 pr-4">Etiquetas/mês</th>
                  <th className="text-left font-semibold text-foreground py-2 pr-4">Térmica</th>
                  <th className="text-left font-semibold text-foreground py-2 pr-4">Comum</th>
                  <th className="text-left font-semibold text-foreground py-2 pr-4">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.volume} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{s.volume}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatBRL(s.thermal)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatBRL(s.common)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatBRL(Math.abs(s.thermal - s.common))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 prose prose-sm max-w-none text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Como calculamos</h2>
          <p>
            Na <strong>térmica</strong>, o custo por etiqueta é o preço da mídia (o rolo de etiquetas
            10x15) dividido pela quantidade de etiquetas do rolo. Na <strong>impressora comum</strong>,
            somamos o papel (A4 comum ou adesivo) e a tinta/toner por página e dividimos pela
            quantidade de etiquetas que cabem em cada folha.
          </p>
          <p>
            A conta cobre só os consumíveis. O preço da impressora, a manutenção e a energia ficam
            de fora — se quiser incluí-los, dilua o custo do equipamento pela quantidade de etiquetas
            que ele deve imprimir na vida útil.
          </p>

          <h2 className="text-xl font-semibold text-foreground mt-8">Quando a térmica vale a pena</h2>
          <p>
            A térmica costuma ganhar quando o volume mensal é alto: ela não usa tinta, imprime mais
            rápido e produz um código de barras mais nítido. Para quem imprime poucas etiquetas por
            semana, a impressora comum que já está na mesa pode ser suficiente. O ponto de virada
            depende do preço da térmica, do custo da mídia e do seu volume.
          </p>

          <h2 className="text-xl font-semibold text-foreground mt-8">O que considerar além do custo</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Nitidez do código de barras: a térmica costuma ter melhor leitura.</li>
            <li>Velocidade: a térmica imprime mais etiquetas por minuto.</li>
            <li>Manutenção: cabeçote, mídia e calibração exigem cuidado.</li>
            <li>Espaço e conexão: USB resolve; Wi-Fi ajuda se a impressora ficar longe.</li>
            <li>Volume: o ganho cresce com a quantidade de etiquetas por mês.</li>
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="calc-faq-title">
          <h2 id="calc-faq-title" className="text-xl font-semibold text-foreground mb-4">Perguntas frequentes</h2>
          <div className="space-y-5">
            {CALCULATOR_FAQS.map((faq) => (
              <div key={faq.q}>
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-1 text-muted-foreground leading-relaxed text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <nav className="mt-10 border-t border-border pt-8" aria-label="Páginas relacionadas">
          <h2 className="text-lg font-semibold text-foreground mb-4">Veja também</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {[
              { href: '/impressora-termica-mercado-livre/', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
              { href: '/etiqueta-10x15/', title: 'Etiqueta 10x15', desc: 'Formato, materiais e configuração' },
              { href: '/converter-zpl-pdf/', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
              { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <span className="block font-semibold text-foreground text-sm">{link.title}</span>
                  <span className="block text-muted-foreground text-sm mt-1">{link.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="bg-primary rounded-2xl p-6 text-white text-center mt-8">
          <h2 className="text-xl font-bold mb-2">Pronto para imprimir sem trabalho manual?</h2>
          <p className="text-white/80 mb-4">Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.</p>
          <Link
            to="/pricing/"
            className="bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-secondary hover:text-foreground transition-all duration-150 hover:-translate-y-px inline-flex items-center gap-2"
          >
            Testar grátis por 7 dias
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
