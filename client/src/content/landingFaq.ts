/**
 * FAQ da landing — fonte única para o acordeão visível (components/landing/Faq)
 * e para o JSON-LD FAQPage da home (lib/seo.ts).
 */
import type { SeoFaq } from './seoPages';

export const LANDING_FAQS: SeoFaq[] = [
  {
    q: 'É seguro conectar minha conta do Mercado Livre?',
    a: 'Sim. A conexão usa o OAuth oficial do Mercado Livre: você autoriza o acesso no site deles e o LabelGo nunca vê nem armazena sua senha. Você pode revogar o acesso a qualquer momento.',
  },
  {
    q: 'Preciso instalar algum programa?',
    a: 'Não. O LabelGo funciona direto no navegador — você gera e imprime etiquetas em PDF ou ZPL sem instalar nada. Para quem quer impressão 100% automática, o plano Pro oferece um agente opcional para Windows.',
  },
  {
    q: 'Posso imprimir em lote?',
    a: 'Sim. Você pode selecionar vários envios prontos para impressão e gerar todas as etiquetas de uma vez, em um único clique.',
  },
  {
    q: 'Quais impressoras são compatíveis?',
    a: 'Qualquer impressora funciona via PDF. Para impressoras térmicas, o LabelGo gera etiquetas em ZPL no formato 10x15 — compatível com Zebra, Elgin, Bixolon e outras que aceitem ZPL2.',
  },
  {
    q: 'Como funciona o cancelamento?',
    a: 'Sem fidelidade: você pode cancelar quando quiser direto no painel. O acesso continua até o fim do período já pago.',
  },
];
