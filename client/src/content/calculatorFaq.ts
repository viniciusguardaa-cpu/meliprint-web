import type { SeoFaq } from './seoPages';

/** FAQs da calculadora — usadas na página e no JSON-LD (lib/seo.ts). */
export const CALCULATOR_FAQS: SeoFaq[] = [
  {
    q: 'O que entra no custo por etiqueta?',
    a: 'Na térmica, o custo é a mídia (a etiqueta em si). Na impressora comum, entram o papel (A4 comum ou adesivo) e a tinta/toner por página. A calculadora não inclui o preço da impressora nem manutenção.',
  },
  {
    q: 'A calculadora serve para impressora térmica e comum?',
    a: 'Sim. Você pode calcular o custo nos dois cenários e comparar com o mesmo volume mensal de etiquetas.',
  },
  {
    q: 'Por que a térmica costuma ter custo menor por etiqueta?',
    a: 'A térmica não usa tinta/toner e a mídia costuma ser barata em volume. Em contrapartida, a impressora térmica custa mais que uma impressora comum — o ganho aparece quando o volume mensal justifica o investimento.',
  },
  {
    q: 'O custo por etiqueta inclui a impressora?',
    a: 'Não. A conta cobre só os consumíveis. Se quiser incluir o equipamento, divida o preço da impressora pela quantidade de etiquetas que ela deve imprimir na vida útil e some ao custo por etiqueta.',
  },
  {
    q: 'Os valores são reais?',
    a: 'São uma estimativa. Os preços de mídia, papel e tinta variam por região, marca e volume de compra. Use os seus valores para chegar ao custo real do seu despacho.',
  },
];
