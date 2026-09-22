/**
 * Conteúdo das páginas públicas de SEO — fonte única consumida por:
 * - App.tsx (rotas renderizando <SeoPage>)
 * - ZplToPdf.tsx (FAQ do conversor)
 * - lib/seo.ts (JSON-LD FAQPage/BreadcrumbList derivado das mesmas Q&As)
 *
 * Regras de conteúdo: nada de depoimentos/números inventados; distinguir sempre
 * impressão em PDF pelo navegador, envio de ZPL à térmica e a impressão
 * automática do Pro (que exige o agente para Windows instalado).
 */

export interface SeoLink {
  href: string;
  label: string;
}

export interface SeoPageSection {
  heading: string;
  body?: string | string[];
  bullets?: string[];
  links?: SeoLink[];
}

export interface SeoFaq {
  q: string;
  a: string;
}

export interface RelatedLink {
  href: string;
  title: string;
  desc: string;
}

export interface SeoPageContent {
  h1: string;
  /** Lead paragraph under the h1. */
  lead: string;
  /** Short label used in the breadcrumb (Início / <crumb>). */
  crumb: string;
  sections: SeoPageSection[];
  faqs?: SeoFaq[];
  related?: RelatedLink[];
}

export const SEO_PAGES: Record<string, SeoPageContent> = {
  '/imprimir-zpl': {
    h1: 'Imprimir ZPL: guia completo para vendedores',
    lead: 'ZPL é a linguagem das impressoras térmicas. Veja três formas de imprimir etiquetas ZPL do Mercado Livre — em térmica, em impressora comum ou de forma automática.',
    crumb: 'Imprimir ZPL',
    sections: [
      {
        heading: 'O que é ZPL?',
        body: [
          'ZPL (Zebra Programming Language) é a linguagem de comandos que impressoras térmicas interpretam nativamente. Um arquivo ZPL é texto puro: começa com ^XA, descreve posição, fontes e códigos de barras da etiqueta e termina com ^XZ.',
          'As etiquetas de envio do Mercado Livre são emitidas em ZPL2 para impressoras térmicas e em PDF para impressoras comuns — sempre no formato 10x15 cm.',
        ],
      },
      {
        heading: 'Forma 1 — enviar ZPL direto a uma impressora térmica',
        body: 'Uma impressora térmica compatível com ZPL2 recebe o código cru e imprime a etiqueta sem conversão — é o caminho mais rápido e sem diálogo de impressão. Com o LabelGo Pro e o agente para Windows instalado, o ZPL é enviado automaticamente à térmica assim que a venda é confirmada.',
        bullets: [
          'Exige impressora térmica que entenda ZPL/ZPL2 e mídia de 100 mm.',
          'Sem conversão, sem diálogo de impressão, etiqueta sai direto.',
          'A automação completa é o modo Pro: agente instalado + térmica USB.',
        ],
      },
      {
        heading: 'Forma 2 — converter ZPL para PDF (sem térmica)',
        body: 'Não tem impressora térmica? Cole o código ZPL no conversor gratuito do LabelGo, baixe o PDF e imprima em qualquer impressora instalada no computador — jato de tinta, laser ou térmica com driver.',
        links: [{ href: '/converter-zpl-pdf', label: 'Abrir o conversor gratuito de ZPL para PDF' }],
      },
      {
        heading: 'Forma 3 — imprimir pelo navegador, em lote',
        body: 'Conectando sua conta do Mercado Livre ao LabelGo, os envios prontos aparecem em uma única tela. Você seleciona vários de uma vez e o LabelGo gera um PDF único com todas as etiquetas para imprimir pelo navegador.',
        links: [
          { href: '/imprimir-etiquetas-em-lote', label: 'Como funciona a impressão em lote' },
          { href: '/pricing', label: 'Conhecer os planos' },
        ],
      },
      {
        heading: 'Qual método escolher',
        bullets: [
          'Poucas etiquetas, sem térmica: PDF pelo navegador ou o conversor gratuito.',
          'Volume alto + térmica com ZPL2: envio direto ou impressão automática do Pro.',
          'ZPL em mãos sem saber o que fazer: converta para PDF e imprima normal.',
        ],
      },
    ],
    faqs: [
      {
        q: 'ZPL funciona em qualquer impressora?',
        a: 'Não. Só impressoras térmicas que interpretem ZPL/ZPL2 aceitam o código direto. Nas demais, converta o ZPL para PDF e imprima normalmente.',
      },
      {
        q: 'Como abrir um arquivo .zpl?',
        a: 'É um arquivo de texto: abre em qualquer editor (bloco de notas). Para visualizar ou imprimir a etiqueta, converta para PDF ou envie o código a uma térmica compatível.',
      },
      {
        q: 'O conversor de ZPL para PDF é grátis?',
        a: 'Sim. A ferramenta do LabelGo é gratuita, não pede login e aceita códigos de até 100 KB — suficiente para etiquetas grandes ou várias juntas.',
      },
      {
        q: 'Dá para imprimir ZPL pelo celular?',
        a: 'Enviar ZPL cru pelo celular exige uma térmica compatível e app específico. O caminho mais simples é converter para PDF e imprimir pelos recursos de impressão do aparelho.',
      },
    ],
    related: [
      { href: '/converter-zpl-pdf', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/etiqueta-10x15', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/impressora-termica-mercado-livre', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/etiqueta-mercado-livre': {
    h1: 'Etiqueta do Mercado Livre: como gerar e imprimir',
    lead: 'Onde a etiqueta de envio fica disponível, quais formatos existem e como imprimir várias etiquetas de uma vez sem abrir pedido por pedido.',
    crumb: 'Etiqueta Mercado Livre',
    sections: [
      {
        heading: 'Onde a etiqueta fica disponível',
        body: [
          'Depois que a venda é confirmada, o envio aparece na seção de envios do painel do vendedor com status "pronto para envio". A partir daí a etiqueta já pode ser emitida — pelo painel do Mercado Livre ou por integrações como o LabelGo.',
          'Se a etiqueta não aparece, geralmente o envio ainda não está pronto: pagamento em análise ou embalagem pendente seguram a liberação.',
        ],
      },
      {
        heading: 'Os formatos da etiqueta',
        body: 'A etiqueta de envio usa o formato 10x15 cm (100x150 mm). Ela pode ser impressa em PDF em qualquer impressora instalada ou em ZPL2 em impressoras térmicas compatíveis.',
        links: [{ href: '/etiqueta-10x15', label: 'Tudo sobre a etiqueta 10x15' }],
      },
      {
        heading: 'Imprimir pelo LabelGo',
        body: 'Ao conectar sua conta via OAuth oficial do Mercado Livre, os envios prontos aparecem automaticamente em uma única tela — sem exportar arquivos nem abrir pedido por pedido. Selecione um ou vários e imprima em um único PDF pelo navegador.',
        links: [{ href: '/imprimir-etiquetas-em-lote', label: 'Impressão em lote' }],
      },
      {
        heading: 'Reimpressão de etiquetas',
        body: 'Etiqueta colou torto ou rasgou? Envios já impressos ficam separados na aba "Reimpressão", para você emitir a mesma etiqueta de novo sem procurar no histórico do Mercado Livre.',
        links: [{ href: '/reimprimir-etiqueta-mercado-livre', label: 'Guia de reimpressão' }],
      },
    ],
    faqs: [
      {
        q: 'A etiqueta do Mercado Livre tem custo?',
        a: 'Não. Emitir a etiqueta é gratuito — o frete já foi pago na venda (por você ou pelo comprador, conforme a campanha).',
      },
      {
        q: 'Posso imprimir a etiqueta depois?',
        a: 'Sim, enquanto o envio estiver dentro do prazo de despacho. Depois de postado, a etiqueta já cumpriu seu papel.',
      },
      {
        q: 'Por que minha etiqueta não aparece?',
        a: 'Confira se o envio está com status "pronto para envio" e, no LabelGo, se a conta conectada é a mesma que realizou a venda.',
      },
      {
        q: 'Preciso de impressora térmica?',
        a: 'Não. O PDF da etiqueta imprime em qualquer impressora comum; a térmica só é necessária para o envio direto em ZPL ou para a impressão automática do Pro.',
      },
    ],
    related: [
      { href: '/imprimir-etiqueta-mercado-livre', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/reimprimir-etiqueta-mercado-livre', title: 'Reimprimir etiqueta', desc: 'Quando e como emitir de novo' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
      { href: '/converter-zpl-pdf', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
    ],
  },

  '/imprimir-etiqueta-mercado-livre': {
    h1: 'Imprimir etiqueta do Mercado Livre: passo a passo',
    lead: 'Do login à etiqueta impressa: o caminho completo para imprimir uma etiqueta ou o dia inteiro de vendas, pelo navegador ou em térmica.',
    crumb: 'Imprimir etiqueta ML',
    sections: [
      {
        heading: '1. Conecte sua conta do Mercado Livre',
        body: 'O LabelGo usa o OAuth oficial do Mercado Livre: você autoriza o acesso no site deles e sua senha nunca passa pelo LabelGo. A conexão pode ser revogada a qualquer momento.',
      },
      {
        heading: '2. Veja os envios prontos',
        body: 'O painel lista os envios com etiqueta disponível, separados entre "prontos para imprimir" e "reimpressão". A lista sincroniza sozinha — não é preciso atualizar nem exportar nada.',
      },
      {
        heading: '3. Selecione e imprima',
        body: 'Marque um ou vários envios e imprima. Pelo navegador, o LabelGo gera um PDF único que vai para qualquer impressora instalada — comum ou térmica com driver. No plano Pro, o agente para Windows imprime em ZPL automaticamente na térmica assim que a venda entra.',
        links: [
          { href: '/imprimir-etiquetas-em-lote', label: 'Imprimir várias de uma vez' },
          { href: '/pricing', label: 'Comparar planos' },
        ],
      },
      {
        heading: '4. Confira antes de despachar',
        bullets: [
          'Imprima em escala 100% (sem "ajustar à página") para não deformar o código de barras.',
          'Verifique se o código de rastreio e os dados do destinatário saíram nítidos.',
          'Cole a etiqueta em superfície lisa, sem dobrar o código de barras.',
          'Se saiu errado, reimprima — é a mesma etiqueta, sem custo extra.',
        ],
        links: [{ href: '/reimprimir-etiqueta-mercado-livre', label: 'Como reimprimir' }],
      },
    ],
    faqs: [
      {
        q: 'Preciso instalar algum programa?',
        a: 'Para imprimir em PDF pelo navegador, não. Só é preciso instalar o agente do LabelGo (Windows) se quiser a impressão automática em térmica do plano Pro.',
      },
      {
        q: 'Funciona no celular?',
        a: 'O painel do LabelGo funciona no navegador do celular. A impressão depende de a impressora estar acessível pelo aparelho (impressão do sistema ou app do fabricante).',
      },
      {
        q: 'Quantas etiquetas posso imprimir de uma vez?',
        a: 'Quantas estiverem prontas: selecione todas e elas saem juntas em um único PDF.',
      },
    ],
    related: [
      { href: '/etiqueta-mercado-livre', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
      { href: '/etiqueta-10x15', title: 'Etiqueta 10x15', desc: 'Formato, materiais e configuração' },
      { href: '/imprimir-zpl', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
    ],
  },

  '/etiqueta-10x15': {
    h1: 'Etiqueta 10x15: o formato padrão do Mercado Livre',
    lead: '100x150 mm, uma etiqueta por envio. Veja os materiais, a configuração de impressão e como imprimir 10x15 sem impressora térmica.',
    crumb: 'Etiqueta 10x15',
    sections: [
      {
        heading: 'O que é a etiqueta 10x15?',
        body: 'É a etiqueta de envio de 100x150 mm (cerca de 4x6 polegadas) usada nos envios do Mercado Livre no Brasil. Concentra endereço do destinatário, código de rastreio e código de barras em uma única etiqueta adesiva que cabe em pacotes pequenos e médios.',
      },
      {
        heading: 'Materiais para imprimir',
        bullets: [
          'Impressora térmica: bobina ou refil de etiquetas de 100 mm de largura (10x15 cm).',
          'Impressora comum: folhas A4 adesivas ou sulfite comum + fita adesiva para fixar.',
          'Evite papel fotográfico ou muito fino — o código de barras precisa ficar nítido.',
        ],
      },
      {
        heading: 'Imprimir 10x15 em impressora térmica',
        body: 'Térmicas de etiquetas trabalham com mídia de 100 mm de largura. Para receber ZPL direto — como faz o agente do LabelGo Pro — a impressora precisa entender ZPL2. Com o driver instalado no computador, qualquer térmica também imprime o PDF gerado pelo navegador.',
        links: [{ href: '/impressora-termica-mercado-livre', label: 'Como escolher a impressora térmica' }],
      },
      {
        heading: 'Imprimir 10x15 em impressora comum',
        body: 'Sem térmica, imprima o PDF em folha A4 comum ou adesiva — jato de tinta e laser funcionam. Mantenha a escala em 100% e, se usar sulfite, recorte nas bordas da etiqueta. Tem um arquivo ZPL em mãos? Converta para PDF antes.',
        links: [{ href: '/converter-zpl-pdf', label: 'Converter ZPL para PDF grátis' }],
      },
      {
        heading: 'Configurações que evitam desperdício',
        bullets: [
          'Escala 100% / tamanho real — nunca "ajustar à página".',
          'Margens no mínimo ou zero nas preferências de impressão.',
          'Qualidade de impressão normal ou alta para o código de barras ficar legível.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Posso imprimir etiqueta 10x15 em folha A4?',
        a: 'Sim. O PDF da etiqueta imprime em A4 normalmente; recorte ou use folha adesiva A4 para colar direto no pacote.',
      },
      {
        q: 'Minha térmica é de 80 mm (cupom). Serve?',
        a: 'Não é ideal: a etiqueta 10x15 fica cortada ou reduzida demais para o código de barras. Prefira imprimir o PDF em uma impressora comum ou use uma térmica de 100 mm.',
      },
      {
        q: 'O formato 10x15 serve para outros marketplaces?',
        a: '10x15 é o padrão de etiqueta de envio de vários marketplaces e transportadoras no Brasil — mas este guia trata especificamente da etiqueta do Mercado Livre.',
      },
    ],
    related: [
      { href: '/converter-zpl-pdf', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/impressora-termica-mercado-livre', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
      { href: '/imprimir-etiqueta-mercado-livre', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/impressora-termica-mercado-livre': {
    h1: 'Impressora térmica para Mercado Livre: o que verificar',
    lead: 'Antes de comprar uma térmica para etiquetas de envio, confira largura, linguagem e conexão — e saiba quando ela nem é necessária.',
    crumb: 'Impressora térmica',
    sections: [
      {
        heading: 'Checklist antes de comprar',
        bullets: [
          'Largura de impressão de pelo menos 100 mm — a etiqueta do Mercado Livre é 10x15 cm.',
          'Suporte a ZPL/ZPL2 para receber o código direto — é o que a impressão automática do LabelGo Pro usa.',
          'Com driver instalado no computador, a térmica também imprime o PDF gerado pelo navegador.',
          'Conexão USB é suficiente — é o que o agente do Pro utiliza.',
          'Térmica direta (sem ribbon) é o tipo mais comum para etiquetas de envio.',
        ],
      },
      {
        heading: 'Modelos populares entre vendedores',
        body: 'Zebra GC420 e ZD220/ZD421, Elgin L-42 e Bixolon XD5/SLP estão entre as térmicas de etiquetas mais vendidas no Brasil. A lista é só uma referência — antes de comprar, confirme no fabricante se o modelo aceita mídia de 100 mm e, para impressão automática, se entende ZPL2.',
      },
      {
        heading: 'Não tem térmica? O PDF resolve',
        body: 'Impressoras jato de tinta e laser imprimem a etiqueta em folha A4 ou papel adesivo — térmica não é obrigatória para despachar no Mercado Livre. E se você tem um arquivo ZPL, converta para PDF gratuitamente.',
        links: [{ href: '/converter-zpl-pdf', label: 'Conversor ZPL para PDF' }],
      },
      {
        heading: 'Impressão automática com o LabelGo Pro',
        body: 'Com o agente LabelGo instalado em um computador Windows, a impressora térmica USB recebe a etiqueta em ZPL automaticamente quando uma venda é confirmada — sem cliques e sem diálogo de impressão. Sem o agente, a impressão em PDF pelo navegador continua disponível em todos os planos.',
        links: [{ href: '/pricing', label: 'Conhecer o LabelGo Pro' }],
      },
    ],
    faqs: [
      {
        q: 'Impressora térmica de cupom (80 mm) serve?',
        a: 'Não é recomendada: a etiqueta 10x15 fica cortada ou pequena demais para o código de barras. Use o PDF em uma impressora comum ou uma térmica de 100 mm.',
      },
      {
        q: 'Precisa ser Zebra?',
        a: 'Não. Qualquer térmica que aceite mídia de 100 mm imprime a etiqueta via PDF com driver. ZPL2 só é exigida para o envio direto/automático do Pro.',
      },
      {
        q: 'USB ou Wi-Fi?',
        a: 'USB resolve e é o que o agente do LabelGo Pro usa. Wi-Fi só ajuda se a impressora ficar longe do computador.',
      },
      {
        q: 'Dá para testar sem comprar impressora?',
        a: 'Sim — o plano tem 7 dias grátis e a impressão em PDF pelo navegador funciona em qualquer impressora instalada.',
      },
    ],
    related: [
      { href: '/etiqueta-10x15', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/imprimir-zpl', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
      { href: '/converter-zpl-pdf', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/reimprimir-etiqueta-mercado-livre': {
    h1: 'Reimprimir etiqueta do Mercado Livre: quando e como',
    lead: 'Etiqueta rasgou, colou torto ou sumiu? A reimpressão emite a mesma etiqueta de novo — sem custo de frete adicional.',
    crumb: 'Reimprimir etiqueta',
    sections: [
      {
        heading: 'Quando é possível reimprimir',
        body: 'Enquanto o envio estiver dentro do prazo de despacho e a etiqueta já tiver sido emitida, você pode imprimi-la de novo quantas vezes precisar. Depois que o pacote é postado, a etiqueta já cumpriu seu papel — reimprimir não é mais necessário.',
      },
      {
        heading: 'Pelo painel do Mercado Livre',
        body: 'Na seção de envios do painel do vendedor, abra o envio correspondente e use a opção de visualizar/imprimir a etiqueta novamente. Ela sai idêntica: mesmo código de rastreio, mesmos dados.',
      },
      {
        heading: 'Pelo LabelGo',
        body: 'Os envios já impressos ficam separados na aba "Reimpressão" do painel — sem misturar com os envios novos. Selecione e imprima de novo em PDF pelo navegador, sem precisar procurar o pedido no histórico do Mercado Livre.',
        links: [{ href: '/imprimir-etiqueta-mercado-livre', label: 'Ver o passo a passo de impressão' }],
      },
      {
        heading: 'Cuidados ao reimprimir',
        bullets: [
          'Use sempre a via mais recente e descarte a etiqueta danificada.',
          'Não cole uma etiqueta por cima da outra — o código de barras pode falhar na leitura.',
          'Confira se o código de rastreio da nova etiqueta é o mesmo do envio.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Reimprimir a etiqueta gera custo?',
        a: 'Não. Reimprimir emite a mesma etiqueta já paga — o frete não é cobrado de novo.',
      },
      {
        q: 'O código de rastreio muda na reimpressão?',
        a: 'Não. É a mesma etiqueta: mesmo rastreio, mesmos dados do destinatário e do envio.',
      },
      {
        q: 'E se o prazo de despacho venceu?',
        a: 'A etiqueta pode não estar mais disponível. Nesse caso, fale com o suporte do Mercado Livre — pode ser preciso cancelar o envio e gerar nova etiqueta.',
      },
    ],
    related: [
      { href: '/etiqueta-mercado-livre', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/imprimir-etiqueta-mercado-livre', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/imprimir-etiquetas-em-lote', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/imprimir-etiquetas-em-lote': {
    h1: 'Imprimir etiquetas em lote no Mercado Livre',
    lead: 'Selecione vários envios e imprima todas as etiquetas de uma vez, em um único PDF — direto do navegador, sem instalar nada.',
    crumb: 'Impressão em lote',
    sections: [
      {
        heading: 'Como funciona a impressão em lote',
        body: 'Em vez de abrir pedido por pedido no painel do Mercado Livre, a impressão em lote reúne todos os envios prontos em uma única lista. Você marca os que quer despachar e imprime tudo junto.',
      },
      {
        heading: 'Passo a passo no LabelGo',
        bullets: [
          'Conecte sua conta do Mercado Livre via OAuth (a senha não passa pelo LabelGo).',
          'Abra a lista de envios prontos para imprimir — ela sincroniza automaticamente.',
          'Marque "selecionar todos" ou escolha só os envios do dia.',
          'Clique em imprimir: o LabelGo gera um único PDF com todas as etiquetas.',
          'Imprima pelo navegador em impressora comum ou térmica com driver.',
        ],
      },
      {
        heading: 'Quando a impressão em lote vale a pena',
        body: 'Quanto mais envios por dia, maior o ganho: uma única impressão substitui o ciclo de abrir pedido, gerar etiqueta e imprimir dezenas de vezes. Também facilita dividir a operação — uma pessoa confere os pacotes enquanto outra imprime tudo de uma vez.',
      },
      {
        heading: 'E se você quiser zero cliques',
        body: 'No plano Pro, o agente para Windows imprime cada etiqueta automaticamente na térmica assim que a venda é confirmada — sem nem abrir o painel. É o mesmo fluxo do lote, mas contínuo e sem seleção manual.',
        links: [{ href: '/pricing', label: 'Conhecer o LabelGo Pro' }],
      },
    ],
    faqs: [
      {
        q: 'Tem limite de etiquetas por lote?',
        a: 'O limite prático é a quantidade de envios prontos na sua lista — todas as selecionadas saem juntas no mesmo PDF.',
      },
      {
        q: 'Posso imprimir envios de mais de uma conta?',
        a: 'Sim. O LabelGo permite conectar múltiplas contas de marketplace e os envios aparecem identificados na mesma lista.',
      },
      {
        q: 'Funciona em impressora comum?',
        a: 'Sim — o PDF gerado vai para qualquer impressora instalada no sistema, comum ou térmica com driver.',
      },
    ],
    related: [
      { href: '/imprimir-etiqueta-mercado-livre', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/etiqueta-mercado-livre', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/impressora-termica-mercado-livre', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
    ],
  },

  // O conversor tem página própria (ferramenta). As FAQs abaixo são renderizadas
  // por ZplToPdf.tsx e viram JSON-LD FAQPage via lib/seo.ts — fonte única.
  '/converter-zpl-pdf': {
    h1: 'Conversor de ZPL para PDF — Grátis',
    lead: 'Cole seu código ZPL e baixe o PDF da etiqueta. Sem login, sem cadastro.',
    crumb: 'Conversor ZPL → PDF',
    sections: [],
    faqs: [
      {
        q: 'O que é um arquivo ZPL?',
        a: 'É um arquivo de texto com os comandos que uma impressora térmica entende: posição dos textos, códigos de barras e dimensões da etiqueta. Começa com ^XA e termina com ^XZ.',
      },
      {
        q: 'O conversor é realmente grátis?',
        a: 'Sim. Não pede login nem cadastro e aceita códigos de até 100 KB — suficiente para etiquetas grandes ou várias em sequência.',
      },
      {
        q: 'Em que tamanho sai o PDF?',
        a: 'O PDF respeita as dimensões definidas no próprio código ZPL — etiquetas do Mercado Livre saem em 10x15 cm, prontas para imprimir em A4 ou térmica com driver.',
      },
      {
        q: 'Serve para etiqueta do Mercado Livre?',
        a: 'Sim. Etiquetas do Mercado Livre em formato ZPL2 convertem normalmente para PDF.',
      },
      {
        q: 'Por que converter para PDF em vez de imprimir o ZPL?',
        a: 'O ZPL cru só é aceito por impressoras térmicas compatíveis. O PDF imprime em qualquer impressora instalada — jato de tinta, laser ou térmica com driver.',
      },
    ],
    related: [
      { href: '/imprimir-zpl', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
      { href: '/etiqueta-10x15', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/etiqueta-mercado-livre', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
    ],
  },
};
