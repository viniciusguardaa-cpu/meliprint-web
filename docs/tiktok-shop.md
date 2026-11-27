# TikTok Shop no LabelGo — escopo e preparação

Status em 27/11/2026: inspeção concluída; integração ainda não implementada nem
publicada. A loja da Companhia do Papel já vende e o aplicativo ainda não foi
criado. A pedido do usuário, foi localizado o cadastro já iniciado no Safari.
A conta de parceiro já existe, mas App developer está desabilitado com região e
mercado Brasil. Os perfis de parceiro e vendedor exibem o mesmo e-mail mascarado.
A documentação de Developer onboarding alerta que o e-mail da loja restringe o
cadastro a seller developer e orienta usar outro e-mail para ISV ou solicitar
allowlisting da conta ao TikTok. Não foi criada senha, submetido cadastro nem
aceito qualquer termo pelo agente. Nenhuma credencial foi criada ou enviada.

## Distribuição

O objetivo é atender outros vendedores do TikTok Shop, começando pelo Brasil.
Criar um aplicativo público do LabelGo como desenvolvedor/ISV, com a categoria
correspondente às funções reais de impressão/logística. Evitar um aplicativo de
seller developer restrito à própria loja. Cada cliente autoriza a própria loja
por OAuth; não precisa criar aplicativo nem fornecer a senha ao LabelGo. A pedido
do usuário, TikTok reutilizará o agente, a impressora e a configuração de impressão
automática já usados pelo cliente no LabelGo, sem nova escolha de impressora.
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

## Bloqueio do cadastro no Safari

O formulário existente foi preservado com Brasil como região e mercado, sem
selecionar uma categoria incompatível. O cadastro público depende de um e-mail
de desenvolvedor diferente do da loja ou da liberação da conta pelo TikTok.
A coincidência dos e-mails mascarados e o aviso oficial indicam uma possível
causa; não foi possível confirmar o e-mail completo nem um motivo específico de
bloqueio emitido pela plataforma. Aguardando a escolha do usuário antes de criar
outra conta. Fonte: https://partner.tiktokshop.com/docv2/page/developer-onboarding
Prova: `docs/evidence/tiktok-safari-isv-category-20261127.jpg`.
