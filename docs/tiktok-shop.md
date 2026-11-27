# TikTok Shop no LabelGo — escopo e preparação

Status em 27/11/2026: inspeção concluída; integração ainda não implementada nem
publicada. A loja da Companhia do Papel já vende, mas o usuário confirmou que
não criou o aplicativo no TikTok Shop Partner Center. O cadastro de parceiro
está aberto no navegador e requer e-mail, verificação, criação de senha e aceite
dos termos pelo titular. Nenhuma credencial foi criada ou enviada.

## Distribuição

O objetivo é atender outros vendedores do TikTok Shop, começando pelo Brasil.
Criar um aplicativo público do LabelGo como desenvolvedor/ISV, com a categoria
correspondente às funções reais de impressão/logística. Evitar um aplicativo de
seller developer restrito à própria loja. Cada cliente autoriza a própria loja
por OAuth; não precisa criar aplicativo nem fornecer a senha ao LabelGo.
A distribuição pública depende das revisões e dos mercados aprovados pelo TikTok.
A Companhia do Papel pode ser piloto após a autorização permitida pelo portal.
Não presumir que um aplicativo não publicado pode acessar a loja real: seguir
os limites de teste/Development Shop apresentados pelo Partner Center.

## Constatações do código

- Providers atuais: Mercado Livre, Shopee, Bling, Magalu e Amazon. TikTok aparece
  apenas em atribuição de tráfego, não como integração de pedidos/etiquetas.
- O registro de providers, OAuth e renovação de tokens são reutilizáveis.
- A fila, a claim atômica e a confirmação do agente já existem. Há deduplicação,
  proteção de resultado incerto e suporte a RAW ZPL e PDF.
- O baseline de ativação e parte das verificações de loja/geração são específicos
  da Shopee. Um provider TikTok não deve ser simplesmente conectado ao poller:
  isso faria pedidos antigos entrarem na impressão e deixaria de aplicar o mesmo
  isolamento de loja. Generalizar o escopo de fila de forma compatível primeiro.
- O TikTok disponibiliza `document_format=ZPL` no Brasil e México no endpoint
  Get Package Shipping Document. Priorizar o ZPL nativo no agente existente;
  validar o payload, o tamanho e os documentos por pacote antes de enfileirar.
- Download de documento não equivale a organizar/comprar frete. Trabalhar com
  etiquetas de pacotes já organizados e fiscalmente prontos. O endpoint pode
  rejeitar o pedido se o envio não estiver organizado ou se for Seller Shipping.
- IDs de pedido/pacote devem permanecer strings (excedem precisão JS Number).

## Critérios para implementação/validação

1. Credenciais do aplicativo somente no backend; estado OAuth de uso único,
   autorização por loja e renovação de token sem segredo no agente ou navegador.
2. Isolamento por usuário, provider e loja em download, inclusão e claim da fila.
3. Baseline por ativação, exclusão dos pedidos anteriores e validação na inserção.
4. Chave única por pacote, retries limitados antes de entrega, confirmação e
   tratamento de resultado incerto sem reimpressão automática.
5. Impressão manual e reimpressão explícita; nenhum teste deve imprimir fisicamente.
6. Mocks de assinatura/API, paginação, múltiplos pacotes, permissões, conta errada,
   NF/etiqueta indisponível, concorrência e regressão ML/Shopee.
7. Testar em Development Shop; depois autorização piloto e validação do formato
   real, antes de divulgar a integração a clientes.

## Documentação oficial consultada

- https://partner.tiktokshop.com/docv2/page/app-review-process
- https://partner.tiktokshop.com/docv2/page/64f198e74830a5028854bf8f
- https://partner.tiktokshop.com/docv2/page/get-package-shipping-document-202309
- https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
- https://partner.tiktokshop.com/docv2/page/br-market-updated-api-workflow-to-support-order-invoice-and-warehouse
