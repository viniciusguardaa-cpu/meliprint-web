/**
 * FAQ da landing — fonte única para o acordeão visível (components/landing/Faq)
 * e para o JSON-LD FAQPage da home (lib/seo.ts).
 */
import type { SeoFaq } from './seoPages';

export const LANDING_FAQS: SeoFaq[] = [
  {
    q: 'Quais marketplaces são suportados?',
    a: 'Mercado Livre e Shopee já estão disponíveis para conexão e impressão em lote. TikTok Shop está em fase de implementação e chega em breve. Você pode conectar mais de um marketplace ao mesmo tempo e imprimir tudo junto.',
  },
  {
    q: 'É seguro conectar minha conta do marketplace?',
    a: 'Sim. A conexão usa o acesso oficial de cada marketplace: você autoriza o acesso no site deles e o LabelGo nunca vê nem armazena sua senha. Você pode revogar o acesso a qualquer momento.',
  },
  {
    q: 'Preciso instalar algum programa?',
    a: 'Não. O LabelGo funciona direto no navegador — você gera e imprime etiquetas em PDF ou formato para impressora térmica sem instalar nada. Para imprimir automaticamente, o plano completo inclui um agente opcional para Windows.',
  },
  {
    q: 'Posso imprimir em lote?',
    a: 'Sim. Você pode selecionar vários envios prontos para impressão e gerar todas as etiquetas de uma vez, em um único clique.',
  },
  {
    q: 'Quais impressoras são compatíveis?',
    a: 'Qualquer impressora funciona via PDF. Para impressoras térmicas, o LabelGo gera etiquetas no formato 10x15 — verifique o formato aceito pelo seu modelo.',
  },
  {
    q: 'Como funciona o cancelamento?',
    a: 'Sem fidelidade: você pode cancelar quando quiser direto no painel. O acesso continua até o fim do período já pago.',
  },
];
