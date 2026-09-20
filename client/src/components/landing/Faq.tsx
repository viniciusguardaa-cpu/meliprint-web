import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Reveal from './Reveal';
import { cn } from '../../lib/utils';

const FAQ_ITEMS = [
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

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="duvidas" className="py-16 sm:py-24 scroll-mt-24" aria-labelledby="faq-title">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-[40%_60%] gap-10 lg:gap-16">
          <Reveal>
            <span className="text-xs font-bold tracking-[0.18em] text-primary uppercase">
              Dúvidas frequentes
            </span>
            <h2
              id="faq-title"
              className="mt-3 text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.05]"
            >
              Ainda tem dúvidas?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Tudo o que você precisa saber antes de começar. Se restar alguma
              pergunta, fale com a gente em{' '}
              <a href="mailto:suporte@labelgo.com.br" className="text-primary font-medium hover:underline">
                suporte@labelgo.com.br
              </a>
              .
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
              {FAQ_ITEMS.map((item, i) => {
                const open = openIndex === i;
                return (
                  <div key={item.q}>
                    <button
                      onClick={() => setOpenIndex(open ? null : i)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-button-${i}`}
                      className="w-full flex items-center justify-between gap-4 py-5 sm:py-6 text-left group"
                    >
                      <span className="text-base sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.q}
                      </span>
                      <span
                        className={cn(
                          'w-9 h-9 shrink-0 rounded-full border border-black/[0.08] flex items-center justify-center transition-all duration-300',
                          open ? 'bg-secondary border-secondary rotate-180' : 'bg-transparent'
                        )}
                      >
                        <ChevronDown className="w-4 h-4 text-foreground" />
                      </span>
                    </button>
                    <div
                      id={`faq-panel-${i}`}
                      role="region"
                      aria-labelledby={`faq-button-${i}`}
                      className="accordion-panel"
                      data-open={open}
                    >
                      <div>
                        <p className="pb-6 pr-10 text-sm sm:text-base text-muted-foreground leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
