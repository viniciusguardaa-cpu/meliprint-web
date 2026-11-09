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
  /** Link externo (fonte oficial) — abre em nova aba. */
  external?: boolean;
}

export interface SeoTable {
  headers: string[];
  rows: string[][];
}

export interface SeoPageSection {
  heading: string;
  body?: string | string[];
  bullets?: string[];
  links?: SeoLink[];
  table?: SeoTable;
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
    lead: 'ZPL é a linguagem das impressoras térmicas. Veja o que é, como abrir um arquivo .zpl e as três formas de imprimir etiquetas ZPL do Mercado Livre — na térmica, em PDF ou em lote.',
    crumb: 'Imprimir ZPL',
    sections: [
      {
        heading: 'O que é ZPL?',
        body: [
          'ZPL (Zebra Programming Language) é a linguagem de comandos que impressoras térmicas interpretam nativamente. Um arquivo ZPL é texto puro: começa com ^XA, descreve posição, fontes, códigos de barras e o tamanho da etiqueta e termina com ^XZ.',
          'As etiquetas de envio do Mercado Livre são emitidas em ZPL2 para impressoras térmicas e em PDF para impressoras comuns — sempre no formato 10x15 cm (100x150 mm). O ZPL não é uma imagem: é a receita que a impressora usa para desenhar a etiqueta.',
        ],
      },
      {
        heading: 'Como abrir um arquivo .zpl',
        body: [
          'Um .zpl abre em qualquer editor de texto (Bloco de Notas, TextEdit, VS Code). Você vai ver os comandos, não a etiqueta. Para visualizar ou imprimir sem uma térmica, converta o arquivo para PDF — o conversor gratuito do LabelGo renderiza o ZPL e gera o PDF no tamanho definido no próprio código.',
        ],
        links: [{ href: '/converter-zpl-pdf/', label: 'Abrir o conversor de ZPL para PDF' }],
      },
      {
        heading: 'Forma 1 — enviar ZPL direto para a impressora térmica',
        body: [
          'Uma impressora térmica compatível com ZPL2 recebe o código cru e imprime a etiqueta sem conversão — é o caminho mais rápido e sem diálogo de impressão. O arquivo precisa chegar à impressora pela porta correta (USB, rede ou fila de impressão) e a mídia precisa ser de 100 mm de largura.',
          'Com o LabelGo Completo e o agente para Windows instalado, o ZPL é enviado automaticamente à térmica assim que a venda é confirmada. Sem o agente, você pode baixar o ZPL e enviá-lo pelo software do fabricante.',
        ],
        bullets: [
          'Exige impressora térmica que entenda ZPL/ZPL2 e mídia de 100 mm.',
          'Sem conversão e sem diálogo de impressão: a etiqueta sai direto.',
          'A automação completa é o modo Completo: agente instalado + térmica USB.',
        ],
      },
      {
        heading: 'Forma 2 — converter ZPL para PDF (sem térmica)',
        body: [
          'Não tem impressora térmica? Cole o código ZPL no conversor gratuito do LabelGo, baixe o PDF e imprima em qualquer impressora instalada — jato de tinta, laser ou térmica com driver. O PDF respeita as dimensões definidas no ZPL; etiquetas do Mercado Livre saem em 10x15 cm.',
          'O conversor não pede login nem cadastro e aceita códigos de até 100 KB — suficiente para uma etiqueta grande ou várias em sequência.',
        ],
        links: [{ href: '/converter-zpl-pdf/', label: 'Converter ZPL para PDF grátis' }],
      },
      {
        heading: 'Forma 3 — imprimir pelo navegador, em lote',
        body: [
          'Conectando sua conta do Mercado Livre ao LabelGo, os envios prontos aparecem em uma única tela. Você seleciona vários de uma vez e o LabelGo gera um PDF único com todas as etiquetas para imprimir pelo navegador — sem baixar ZPL pedido por pedido.',
          'É o caminho mais simples para quem imprime poucas etiquetas por dia ou não quer instalar nada. Para volume alto com térmica, a automação do plano Completo evita até o clique de imprimir.',
        ],
        links: [
          { href: '/imprimir-etiquetas-em-lote/', label: 'Como funciona a impressão em lote' },
          { href: '/pricing/', label: 'Conhecer os planos' },
        ],
      },
      {
        heading: 'Qual método escolher',
        table: {
          headers: ['Método', 'Impressora', 'Melhor para', 'Automação'],
          rows: [
            ['ZPL direto', 'Térmica ZPL2, 100 mm', 'Volume alto, etiqueta nítida', 'Total com o agente do LabelGo'],
            ['ZPL → PDF', 'Qualquer impressora', 'Quem não tem térmica', 'Manual'],
            ['PDF em lote', 'Qualquer impressora', 'Poucas etiquetas por dia', 'Manual'],
          ],
        },
        bullets: [
          'Poucas etiquetas, sem térmica: PDF pelo navegador ou o conversor gratuito.',
          'Volume alto + térmica com ZPL2: envio direto ou impressão automática do LabelGo.',
          'ZPL em mãos sem saber o que fazer: converta para PDF e imprima normal.',
        ],
      },
      {
        heading: 'ZPL do Mercado Livre: o que muda',
        body: [
          'A etiqueta do Mercado Livre é 10x15 cm e pode incluir o DANFE simplificado quando a impressão conjunta está ativada nas preferências de venda. Nesse caso, a térmica recebe um único .zpl com a etiqueta e o DANFE em código; a folha de controle continua sendo impressa à parte.',
          'Se você usa impressora comum, o Mercado Livre gera PDFs separados (etiqueta, folha de controle, lista de produtos e canhoto). O canhoto e a folha de controle são para uso do vendedor e não devem ser colados no pacote.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-imprimir-as-etiquetas-de-envios', label: 'Fonte: como imprimir as etiquetas (Mercado Livre)', external: true },
          { href: 'https://vendedores.mercadolivre.com.br/aprender/nota/como-imprimir-o-danfe-simplificado-junto-com-a-etiqueta-de-envio', label: 'Fonte: DANFE simplificado com a etiqueta', external: true },
        ],
      },
      {
        heading: 'Problemas comuns ao imprimir ZPL',
        bullets: [
          'Sai em branco ou com caracteres estranhos: a impressora provavelmente não está em modo ZPL ou o driver está convertendo o arquivo. Confirme a linguagem nas configurações do equipamento.',
          'Etiqueta cortada ou deslocada: a mídia não é de 100 mm ou a calibração está errada. Recalibre a impressora com o insumo correto.',
          'Código de barras ilegível: velocidade alta demais, pouca escuridão (darkness) ou cabeçote sujo. Reduza a velocidade, ajuste a densidade e limpe o cabeçote.',
          'ZPL imprime, mas o tamanho não bate: confira o DPI configurado no driver (203 dpi é o mais comum) e o tamanho da etiqueta no software.',
        ],
      },
      {
        heading: 'Como testar antes de despachar',
        bullets: [
          'Converta o ZPL para PDF e confira visualmente o código de barras e os dados do destinatário.',
          'Imprima uma etiqueta de teste na térmica e passe o leitor de código de barras.',
          'Se a térmica for Zebra, use o arquivo de calibração indicado pela central de vendedores do Mercado Livre.',
          'Mantenha a etiqueta sem fita adesiva sobre o código de barras ou QR code.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-etiquetar-pacotes-para-nao-serem-recusados', label: 'Fonte: como etiquetar pacotes', external: true },
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
        a: 'É um arquivo de texto: abre em qualquer editor (Bloco de Notas, TextEdit, VS Code). Para visualizar ou imprimir a etiqueta, converta para PDF ou envie o código a uma térmica compatível.',
      },
      {
        q: 'O conversor de ZPL para PDF é grátis?',
        a: 'Sim. A ferramenta do LabelGo é gratuita, não pede login e aceita códigos de até 100 KB — suficiente para etiquetas grandes ou várias juntas.',
      },
      {
        q: 'Dá para imprimir ZPL pelo celular?',
        a: 'Enviar ZPL cru pelo celular exige uma térmica compatível e app específico. O caminho mais simples é converter para PDF e imprimir pelos recursos de impressão do aparelho.',
      },
      {
        q: 'Qual a diferença entre ZPL e PDF?',
        a: 'O PDF é um documento pronto para qualquer impressora. O ZPL é a linguagem que a térmica interpreta; ele não abre como imagem e só imprime em equipamento compatível — em troca, sai mais rápido e sem conversão.',
      },
      {
        q: 'O ZPL do Mercado Livre inclui o DANFE?',
        a: 'Se a impressão conjunta do DANFE simplificado estiver ativada, a térmica recebe um único .zpl com a etiqueta e o DANFE. Caso contrário, o DANFE é impresso separadamente.',
      },
    ],
    related: [
      { href: '/converter-zpl-pdf/', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/etiqueta-10x15/', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/impressora-termica-mercado-livre/', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/etiqueta-mercado-livre': {
    h1: 'Etiqueta do Mercado Livre: como gerar e imprimir',
    lead: 'O que é a etiqueta de envio, onde ela fica disponível, quais formatos existem e como imprimir várias de uma vez sem abrir pedido por pedido.',
    crumb: 'Etiqueta Mercado Livre',
    sections: [
      {
        heading: 'O que é a etiqueta de envio',
        body: [
          'A etiqueta de envio é o documento que identifica o pacote no trajeto até o comprador. No Mercado Livre ela usa o formato 10x15 cm (100x150 mm) e reúne, em uma única etiqueta adesiva, o endereço do destinatário, o código de rastreio e o código de barras ou QR code que a transportadora lê na coleta.',
          'Ela é emitida pelo Mercado Livre depois que a venda é confirmada e o envio fica disponível para despacho. O vendedor não precisa criar a etiqueta em outro sistema: basta imprimir o arquivo gerado pelo próprio Mercado Livre ou por uma integração autorizada, como o LabelGo.',
        ],
      },
      {
        heading: 'Onde a etiqueta fica disponível',
        body: [
          'No painel do vendedor, a etiqueta aparece na seção de envios (Minhas vendas > Envios) quando o pedido está com status "pronto para envio". A partir daí ela pode ser emitida pelo painel do Mercado Livre ou por uma integração conectada via OAuth.',
          'Se a etiqueta ainda não aparece, geralmente o envio não está pronto: pagamento em análise, estoque pendente ou dados de envio incompletos seguram a liberação. Confira o status do pedido antes de tentar imprimir de novo.',
        ],
      },
      {
        heading: 'PDF ou ZPL: qual formato escolher',
        body: 'A etiqueta do Mercado Livre é a mesma nos dois formatos; o que muda é a forma de imprimir. Se você não tem térmica, o PDF resolve. Se tem uma térmica ZPL2, o arquivo .zpl evita o diálogo de impressão e permite a automação do LabelGo Completo.',
        table: {
          headers: ['Formato', 'Impressora', 'Vantagem', 'Quando usar'],
          rows: [
            ['PDF', 'Comum (jato de tinta/laser) ou térmica com driver', 'Abre em qualquer lugar e imprime em qualquer impressora', 'Poucas etiquetas, sem térmica'],
            ['ZPL/ZPL2', 'Térmica compatível com ZPL', 'Sai direto, sem conversão e com alta nitidez', 'Volume alto, térmica e impressão automática'],
          ],
        },
        links: [{ href: '/etiqueta-10x15/', label: 'Tudo sobre a etiqueta 10x15' }],
      },
      {
        heading: 'Como imprimir pelo painel do Mercado Livre',
        body: [
          'O caminho oficial é: acesse Minhas vendas, abra o envio com etiqueta disponível e clique em imprimir. O Mercado Livre gera o arquivo conforme a impressora selecionada. Nas preferências de venda você define se quer imprimir também o canhoto e a folha de controle.',
          'Se você usa impressora comum, o Mercado Livre pode gerar folha de controle, lista de produtos e canhoto — documentos de uso do vendedor, que não devem ser colados no pacote. Com térmica, é possível imprimir a etiqueta sem canhoto, usando rolos de 10x15 cm.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-imprimir-as-etiquetas-de-envios', label: 'Fonte: como imprimir as etiquetas (Mercado Livre)', external: true },
        ],
      },
      {
        heading: 'Como imprimir pelo LabelGo',
        body: [
          'Ao conectar sua conta via OAuth oficial do Mercado Livre, os envios prontos aparecem automaticamente em uma única tela — sem exportar arquivos nem abrir pedido por pedido. Selecione um ou vários e imprima em um único PDF pelo navegador.',
          'No plano Completo, o agente para Windows envia o ZPL direto para a térmica assim que a venda é confirmada. A impressão em PDF pelo navegador continua disponível em todos os planos.',
        ],
        links: [
          { href: '/imprimir-etiquetas-em-lote/', label: 'Impressão em lote' },
          { href: '/pricing/', label: 'Comparar planos' },
        ],
      },
      {
        heading: 'Erros comuns que fazem a etiqueta ser recusada',
        body: 'A maior parte das recusas vem de impressão ou colagem fora do padrão. A central de vendedores do Mercado Livre lista os erros mais frequentes:',
        bullets: [
          'Fita adesiva sobre o código de barras ou QR code — a transportadora não consegue ler.',
          'Etiqueta dobrada, com bolhas ou colada sobre a dobra do pacote.',
          'Tamanho alterado na impressão (escala diferente de 100%).',
          'Impressão borrada, com tinta insuficiente ou cabeçote sujo.',
          'Etiqueta rasurada, cortada ou com informação escrita à mão.',
          'Uma etiqueta usada em mais de um pacote — cada envio tem a sua.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-etiquetar-pacotes-para-nao-serem-recusados', label: 'Fonte: como etiquetar pacotes', external: true },
          { href: 'https://vendedores.mercadolivre.com.br/aprender/nota/como-gerar-as-etiquetas-dos-pacotes-corretamente', label: 'Fonte: erros mais comuns ao imprimir', external: true },
        ],
      },
      {
        heading: 'Reimpressão: quando e como emitir de novo',
        body: [
          'A etiqueta tem prazo de validade e pode ser reimpressa enquanto o envio está dentro do prazo de despacho. Se ela rasgou, colou torto ou a impressora falhou, é possível emitir a mesma etiqueta novamente sem custo adicional de frete.',
          'No Mercado Livre, o caminho é: abra a venda, clique nos três pontinhos, escolha "Preciso de ajuda" e selecione a opção correspondente (etiqueta com erros, recusada pela transportadora ou alteração de endereço). Depois clique em "Gerar minha etiqueta novamente". No LabelGo, envios já impressos ficam separados na aba "Reimpressão".',
        ],
        links: [{ href: '/reimprimir-etiqueta-mercado-livre/', label: 'Guia de reimpressão' }],
      },
      {
        heading: 'Checklist antes de despachar',
        bullets: [
          'Etiqueta impressa em 100%, sem "ajustar à página".',
          'Código de barras e QR code nítidos e livres de fita adesiva.',
          'Etiqueta colada lisa, sem dobras, no pacote correto.',
          'Canhoto e folha de controle guardados com você, não colados no pacote.',
          'Dados do destinatário conferidos antes de fechar o pacote.',
          'Etiqueta dentro do prazo de despacho.',
        ],
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
        a: 'Confira se o envio está com status "pronto para envio" e, no LabelGo, se a conta conectada é a mesma que realizou a venda. Pagamento em análise ou estoque pendente também seguram a liberação.',
      },
      {
        q: 'Preciso de impressora térmica?',
        a: 'Não. O PDF da etiqueta imprime em qualquer impressora comum; a térmica só é necessária para o envio direto em ZPL ou para a impressão automática do LabelGo.',
      },
      {
        q: 'Posso imprimir a etiqueta sem canhoto?',
        a: 'Sim. Com térmica e rolos de 10x15 cm, a etiqueta sem canhoto é o formato mais comum. O canhoto é apenas para controle do vendedor e não deve ser colado no pacote.',
      },
      {
        q: 'A etiqueta vale para qualquer transportadora?',
        a: 'A etiqueta é gerada pelo Mercado Livre para o envio específico daquela venda, com a transportadora definida no pedido. Não reaproveite a etiqueta de um envio em outro.',
      },
    ],
    related: [
      { href: '/imprimir-etiqueta-mercado-livre/', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/reimprimir-etiqueta-mercado-livre/', title: 'Reimprimir etiqueta', desc: 'Quando e como emitir de novo' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
      { href: '/converter-zpl-pdf/', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
    ],
  },

  '/imprimir-etiqueta-mercado-livre': {
    h1: 'Imprimir etiqueta do Mercado Livre: passo a passo',
    lead: 'Do login à etiqueta impressa: o caminho completo para imprimir uma etiqueta ou o dia inteiro de vendas, pelo navegador ou em térmica.',
    crumb: 'Imprimir etiqueta ML',
    sections: [
      {
        heading: 'Antes de começar: o que você precisa',
        body: 'Para imprimir a etiqueta você precisa de três coisas: uma conta de vendedor no Mercado Livre com o envio disponível, uma impressora (comum ou térmica) e o arquivo da etiqueta — PDF ou ZPL. Não é obrigatório instalar nada para imprimir pelo navegador.',
        table: {
          headers: ['Você tem', 'Como imprimir', 'Observação'],
          rows: [
            ['Impressora comum (jato/laser)', 'PDF em A4 ou papel adesivo', 'Escala 100%, sem ajustar à página'],
            ['Térmica com driver', 'PDF ou ZPL', 'Mídia de 100 mm'],
            ['Térmica ZPL2 + agente', 'ZPL automático', 'Plano Completo, Windows'],
            ['Só celular', 'PDF pelo navegador', 'Depende da impressão do sistema'],
          ],
        },
      },
      {
        heading: 'Passo 1 — encontre a etiqueta no Mercado Livre',
        body: [
          'Acesse Minhas vendas > Envios e procure o pedido com status "pronto para envio". A etiqueta fica disponível nesse envio; se o pedido ainda estiver em análise ou sem estoque, ela não aparece.',
          'No LabelGo, a lista de envios prontos aparece automaticamente depois que você conecta a conta via OAuth. Você não precisa abrir pedido por pedido nem exportar arquivo.',
        ],
      },
      {
        heading: 'Passo 2 — escolha o formato',
        body: 'PDF é o formato universal: imprime em qualquer impressora e abre em qualquer dispositivo. ZPL é para térmicas compatíveis e permite impressão direta/automática. Se você tem dúvida, comece pelo PDF.',
        table: {
          headers: ['Formato', 'Onde imprime', 'Melhor para'],
          rows: [
            ['PDF', 'Comum, laser, jato ou térmica com driver', 'Poucas etiquetas, qualquer impressora'],
            ['ZPL', 'Térmica ZPL2', 'Volume alto, automação'],
          ],
        },
      },
      {
        heading: 'Passo 3 — imprima no tamanho certo',
        body: 'A etiqueta é 10x15 cm (100x150 mm). Na janela de impressão, escolha a impressora, o tamanho do papel 10x15 e a escala 100%. Nunca use "ajustar à página" ou "fit to page": isso deforma o código de barras e a transportadora pode recusar o pacote.',
        bullets: [
          'Margens: mínimo ou zero, se a impressora permitir.',
          'Qualidade: normal ou alta; evite rascunho.',
          'Papel: A4 comum/adesivo na impressora comum; rolo 10x15 na térmica.',
          'Térmica: confira a calibração e a densidade antes de imprimir o lote.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-imprimir-as-etiquetas-de-envios', label: 'Fonte: como imprimir as etiquetas (Mercado Livre)', external: true },
        ],
      },
      {
        heading: 'Passo 4 — imprima pelo LabelGo em lote',
        body: [
          'Com a conta conectada, selecione todos os envios prontos e clique em imprimir. O LabelGo gera um PDF único com todas as etiquetas — ideal para dias de muitas vendas. No plano Completo, o agente para Windows envia o ZPL automaticamente para a térmica USB.',
          'A impressão em lote evita o vai e vem de abrir pedido, baixar arquivo e imprimir um por um. Se um envio não estiver pronto, ele não entra na seleção.',
        ],
        links: [
          { href: '/imprimir-etiquetas-em-lote/', label: 'Como funciona a impressão em lote' },
          { href: '/pricing/', label: 'Comparar planos' },
        ],
      },
      {
        heading: 'Passo 5 — confira e cole',
        body: 'Antes de fechar o pacote, confira se o código de barras e o QR code estão nítidos e se o endereço é o do pedido. Cole a etiqueta lisa, sem dobras e sem fita adesiva sobre o código. Cada pacote recebe a etiqueta do seu próprio envio.',
        bullets: [
          'Não cubra o código de barras/QR com fita ou plástico.',
          'Não escreva, rasure ou corte a etiqueta.',
          'Não cole o canhoto nem a folha de controle no pacote.',
          'Se a etiqueta saiu errada, reimprima antes de despachar.',
        ],
        links: [{ href: '/reimprimir-etiqueta-mercado-livre/', label: 'Como reimprimir' }],
      },
      {
        heading: 'Erros comuns e como resolver',
        table: {
          headers: ['Problema', 'Causa provável', 'Solução'],
          rows: [
            ['Etiqueta não aparece', 'Envio ainda não está pronto', 'Confira o status em Minhas vendas > Envios'],
            ['Código de barras ilegível', 'Escala errada, pouca tinta ou cabeçote sujo', 'Imprima em 100%, aumente a qualidade e limpe o cabeçote'],
            ['Etiqueta cortada', 'Papel/mídia no tamanho errado', 'Use 10x15 cm e recalibre a térmica'],
            ['Etiqueta vencida', 'Prazo de despacho passou', 'Reimprima pelo fluxo do Mercado Livre'],
            ['Transportadora recusou', 'Etiqueta dobrada, rasurada ou coberta', 'Reimprima e cole novamente, sem fita sobre o código'],
          ],
        },
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/aprender/nota/como-gerar-as-etiquetas-dos-pacotes-corretamente', label: 'Fonte: erros mais comuns (Mercado Livre)', external: true },
        ],
      },
      {
        heading: 'Reimpressão: o que fazer quando a etiqueta falha',
        body: 'Enquanto o envio estiver dentro do prazo, a reimpressão emite a mesma etiqueta sem custo adicional. No Mercado Livre, abra a venda, clique nos três pontinhos, escolha "Preciso de ajuda" e depois "Gerar minha etiqueta novamente". No LabelGo, use a aba "Reimpressão" para reemitir sem procurar no histórico.',
        links: [{ href: '/reimprimir-etiqueta-mercado-livre/', label: 'Guia de reimpressão' }],
      },
      {
        heading: 'Checklist final',
        bullets: [
          'Conta conectada é a mesma que fez a venda.',
          'Etiqueta impressa em 100%, no tamanho 10x15.',
          'Código de barras e QR nítidos.',
          'Etiqueta colada lisa, sem fita sobre o código.',
          'Pacote correto para cada etiqueta.',
          'Etiqueta dentro do prazo de despacho.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Preciso instalar algum programa?',
        a: 'Para imprimir em PDF pelo navegador, não. Só é preciso instalar o agente do LabelGo (Windows) se quiser a impressão automática em térmica do plano Completo.',
      },
      {
        q: 'Funciona no celular?',
        a: 'O painel do LabelGo funciona no navegador do celular. A impressão depende de a impressora estar acessível pelo aparelho (impressão do sistema ou app do fabricante).',
      },
      {
        q: 'Quantas etiquetas posso imprimir de uma vez?',
        a: 'Quantas estiverem prontas: selecione todas e elas saem juntas em um único PDF.',
      },
      {
        q: 'O que faço se a etiqueta sair borrada?',
        a: 'Confira a tinta (impressora comum) ou a densidade e a limpeza do cabeçote (térmica). Reimprima em qualidade maior e confira o código de barras com um leitor antes de colar.',
      },
      {
        q: 'Posso imprimir a etiqueta de um pedido já postado?',
        a: 'Depois de postado, a etiqueta já cumpriu o papel. Se precisar do comprovante, use o histórico do envio; para um novo despacho, é preciso um novo envio/etiqueta.',
      },
      {
        q: 'A etiqueta precisa de canhoto?',
        a: 'Não para o pacote. O canhoto é opcional e serve para controle do vendedor; com térmica e rolo 10x15, a etiqueta sem canhoto é o formato mais comum.',
      },
    ],
    related: [
      { href: '/etiqueta-mercado-livre/', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
      { href: '/etiqueta-10x15/', title: 'Etiqueta 10x15', desc: 'Formato, materiais e configuração' },
      { href: '/imprimir-zpl/', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
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
        body: 'Térmicas de etiquetas trabalham com mídia de 100 mm de largura. Para receber ZPL direto — como faz o agente do LabelGo Completo — a impressora precisa entender ZPL2. Com o driver instalado no computador, qualquer térmica também imprime o PDF gerado pelo navegador.',
        links: [{ href: '/impressora-termica-mercado-livre/', label: 'Como escolher a impressora térmica' }],
      },
      {
        heading: 'Imprimir 10x15 em impressora comum',
        body: 'Sem térmica, imprima o PDF em folha A4 comum ou adesiva — jato de tinta e laser funcionam. Mantenha a escala em 100% e, se usar sulfite, recorte nas bordas da etiqueta. Tem um arquivo ZPL em mãos? Converta para PDF antes.',
        links: [{ href: '/converter-zpl-pdf/', label: 'Converter ZPL para PDF grátis' }],
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
      { href: '/converter-zpl-pdf/', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/impressora-termica-mercado-livre/', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
      { href: '/imprimir-etiqueta-mercado-livre/', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
    ],
  },

  '/impressora-termica-mercado-livre': {
    h1: 'Impressora térmica para Mercado Livre: o que verificar',
    lead: 'Antes de comprar uma térmica para etiquetas de envio, confira largura, linguagem e conexão — e saiba quando ela nem é necessária.',
    crumb: 'Impressora térmica',
    sections: [
      {
        heading: 'Térmica é obrigatória para vender no Mercado Livre?',
        body: [
          'Não. A etiqueta do Mercado Livre pode ser impressa em PDF em qualquer impressora comum — jato de tinta, laser ou até uma térmica com driver. A térmica não é uma exigência do Mercado Livre; ela é uma escolha de operação.',
          'A vantagem aparece no volume: uma térmica de etiquetas imprime mais rápido, não usa tinta e produz um código de barras mais nítido. Para quem despacha poucas etiquetas por semana, a impressora comum que já está na mesa resolve.',
        ],
      },
      {
        heading: 'Checklist antes de comprar',
        bullets: [
          'Largura de impressão de pelo menos 100 mm — a etiqueta do Mercado Livre é 10x15 cm.',
          'Suporte a ZPL/ZPL2 se você quer envio direto/automático; sem isso, a térmica imprime o PDF pelo driver.',
          'Conexão USB é suficiente e é o que o agente do LabelGo utiliza.',
          'Térmica direta (sem ribbon) é o tipo mais comum para etiquetas de envio.',
          'Resolução de 203 dpi é o padrão do mercado; 300 dpi dá mais nitidez, mas custa mais.',
          'Confirme o tipo de mídia: rolo/refil de 100 mm, etiqueta 10x15, com ou sem adesivo.',
          'Verifique se há driver para o seu sistema operacional (Windows, macOS ou Linux).',
        ],
      },
      {
        heading: 'Compare os tipos de impressora',
        table: {
          headers: ['Impressora', 'Imprime etiqueta?', 'Custo por etiqueta', 'Melhor para'],
          rows: [
            ['Jato de tinta/laser', 'Sim, via PDF', 'Tinta/papel', 'Baixo volume'],
            ['Térmica 80 mm (cupom)', 'Não recomendada', 'Baixo', 'Cupom fiscal, não etiqueta 10x15'],
            ['Térmica 100 mm (PDF)', 'Sim, com driver', 'Baixo', 'Volume médio'],
            ['Térmica 100 mm ZPL2', 'Sim, direto/automático', 'Baixo', 'Volume alto e automação'],
          ],
        },
      },
      {
        heading: 'Modelos populares entre vendedores',
        body: [
          'Zebra GC420 e ZD220/ZD421, Elgin L-42 e Bixolon XD5/SLP estão entre as térmicas de etiquetas mais vendidas no Brasil. A lista é só uma referência — antes de comprar, confirme no fabricante se o modelo aceita mídia de 100 mm e, para impressão automática, se entende ZPL2.',
          'Não compre uma térmica de cupom de 80 mm esperando imprimir a etiqueta 10x15: a largura não bate e o código de barras sai cortado ou reduzido demais.',
        ],
      },
      {
        heading: 'Como configurar a térmica',
        body: 'O roteiro é parecido entre os modelos: instale o driver, cadastre a etiqueta 10x15 (100x150 mm), selecione a mídia correta e calibre a impressora. Na Zebra, a central de vendedores do Mercado Livre indica um arquivo de calibração; nas demais, use o utilitário do fabricante.',
        bullets: [
          'Driver instalado e impressora selecionada no sistema.',
          'Tamanho da etiqueta: 100x150 mm (10x15 cm).',
          'Orientação: retrato, sem escala/ajuste.',
          'Densidade (darkness) e velocidade: comece no padrão e ajuste se o código sair fraco.',
          'Faça um teste com uma etiqueta real e passe o leitor de código de barras.',
        ],
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-imprimir-as-etiquetas-de-envios', label: 'Fonte: como imprimir as etiquetas (Mercado Livre)', external: true },
        ],
      },
      {
        heading: 'ZPL ou PDF na térmica?',
        body: 'A térmica aceita os dois caminhos, mas eles não são equivalentes. O PDF passa pelo driver e pelo diálogo de impressão; o ZPL vai direto ao equipamento e é o que permite a automação.',
        table: {
          headers: ['Caminho', 'Como funciona', 'Vantagem', 'Limitação'],
          rows: [
            ['PDF + driver', 'O sistema renderiza e envia a imagem', 'Funciona em qualquer térmica com driver', 'Passa pelo diálogo e pelo spooler'],
            ['ZPL direto', 'O código vai direto à impressora', 'Rápido, nítido e automatizável', 'Exige térmica ZPL2'],
          ],
        },
      },
      {
        heading: 'Impressão automática com o LabelGo Completo',
        body: 'Com o agente LabelGo instalado em um computador Windows, a impressora térmica USB recebe a etiqueta em ZPL automaticamente quando uma venda é confirmada — sem cliques e sem diálogo de impressão. Sem o agente, a impressão em PDF pelo navegador continua disponível em todos os planos.',
        links: [{ href: '/pricing/', label: 'Conhecer o LabelGo Completo' }],
      },
      {
        heading: 'Quando não vale comprar',
        bullets: [
          'Você imprime menos de 10 etiquetas por dia: a impressora comum resolve.',
          'Você já tem uma jato de tinta/laser e o volume é baixo.',
          'O orçamento é curto: comece no PDF e invista na térmica quando o volume justificar.',
          'Você precisa de cupom fiscal, não de etiqueta: a térmica de 80 mm é outro equipamento.',
        ],
      },
      {
        heading: 'Cuidados com a mídia e a conservação',
        bullets: [
          'Guarde os rolos longe de calor, umidade e sol direto: o papel térmico escurece e perde contraste com o tempo.',
          'Use mídia de 100 mm com adesivo de qualidade; etiqueta descolando ou dobrada pode ser recusada na coleta.',
          'Limpe o cabeçote com álcool isopropílico e pano que não solte fios, seguindo o manual do fabricante.',
          'Se a impressão começar a falhar no mesmo rolo, troque a mídia antes de mexer na densidade.',
        ],
      },
      {
        heading: 'Fontes oficiais',
        links: [
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-imprimir-as-etiquetas-de-envios', label: 'Mercado Livre: como imprimir as etiquetas', external: true },
          { href: 'https://vendedores.mercadolivre.com.br/nota/como-etiquetar-pacotes-para-nao-serem-recusados', label: 'Mercado Livre: como etiquetar pacotes', external: true },
        ],
      },
    ],
    faqs: [
      {
        q: 'Impressora térmica de cupom (80 mm) serve?',
        a: 'Não é recomendada: a etiqueta 10x15 fica cortada ou pequena demais para o código de barras. Use o PDF em uma impressora comum ou uma térmica de 100 mm.',
      },
      {
        q: 'Precisa ser Zebra?',
        a: 'Não. Qualquer térmica que aceite mídia de 100 mm imprime a etiqueta via PDF com driver. ZPL2 só é exigida para o envio direto/automático do LabelGo.',
      },
      {
        q: 'USB ou Wi-Fi?',
        a: 'USB resolve e é o que o agente do LabelGo Completo usa. Wi-Fi só ajuda se a impressora ficar longe do computador.',
      },
      {
        q: 'Dá para testar sem comprar impressora?',
        a: 'Sim — o plano tem 7 dias grátis e a impressão em PDF pelo navegador funciona em qualquer impressora instalada.',
      },
      {
        q: 'Qual a diferença entre térmica direta e térmica com ribbon?',
        a: 'A térmica direta imprime no papel térmico sem fita e é o tipo mais comum para etiquetas de envio. A de transferência térmica usa ribbon e é mais durável, mas custa mais por etiqueta.',
      },
      {
        q: 'Preciso de 300 dpi?',
        a: 'Não para a etiqueta 10x15 do Mercado Livre. 203 dpi é o padrão do mercado e suficiente para o código de barras; 300 dpi ajuda em textos muito pequenos ou logotipos finos.',
      },
    ],
    related: [
      { href: '/etiqueta-10x15/', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/imprimir-zpl/', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
      { href: '/converter-zpl-pdf/', title: 'Conversor ZPL → PDF', desc: 'Ferramenta gratuita, sem cadastro' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
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
        links: [{ href: '/imprimir-etiqueta-mercado-livre/', label: 'Ver o passo a passo de impressão' }],
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
      { href: '/etiqueta-mercado-livre/', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/imprimir-etiqueta-mercado-livre/', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/imprimir-etiquetas-em-lote/', title: 'Impressão em lote', desc: 'Várias etiquetas de uma vez' },
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
        body: 'No plano Completo, o agente para Windows imprime cada etiqueta automaticamente na térmica assim que a venda é confirmada — sem nem abrir o painel. É o mesmo fluxo do lote, mas contínuo e sem seleção manual.',
        links: [{ href: '/pricing/', label: 'Conhecer o LabelGo Completo' }],
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
      { href: '/imprimir-etiqueta-mercado-livre/', title: 'Imprimir etiqueta ML', desc: 'Passo a passo completo' },
      { href: '/etiqueta-mercado-livre/', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
      { href: '/impressora-termica-mercado-livre/', title: 'Impressora térmica', desc: 'O que verificar antes de comprar' },
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
      { href: '/imprimir-zpl/', title: 'Imprimir ZPL', desc: 'Guia para vendedores' },
      { href: '/etiqueta-10x15/', title: 'Etiqueta 10x15', desc: 'O formato padrão do Mercado Livre' },
      { href: '/etiqueta-mercado-livre/', title: 'Etiqueta Mercado Livre', desc: 'Onde gerar e formatos' },
    ],
  },
};
