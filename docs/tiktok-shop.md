# TikTok Shop no LabelGo

## Estado em 27/11/2026

Integração implementada e testada localmente na branch `feat/tiktok-shop-printing`.
**Não está publicada nem habilitada em produção.** O aplicativo público LabelGo
foi criado no Partner Center, categoria Shipping, vendedores locais do Brasil.
O cadastro do parceiro foi enviado e está **Under review**; o app permanece
Draft/Developing. Aprovação do parceiro não equivale à aprovação/publicação do app.

- Service ID do aplicativo criado: `7712776215615276801`.
- Callback: `https://labelgo.com.br/api/auth/oauth/tiktok/callback`.
- Suporte: `suporte@labelgo.com.br`.
- Na última inspeção, nenhum escopo estava ativo. São necessários
  `seller.authorization.info`, `seller.order.info`, `seller.fulfillment.basic`.
- Ainda faltam as liberações do TikTok, questionário de segurança/privacidade,
  listing em português, revisão funcional e validação em Development Shop/piloto.
- Não foi autorizada nenhuma loja real para os testes. Nenhuma etiqueta foi
  enviada a uma impressora. O segredo do aplicativo não foi copiado do portal.

## Causa e solução

TikTok não existia como provider de pedidos/etiquetas: as referências anteriores
eram apenas atribuição de tráfego. Já havia OAuth, tokens criptografados, fila,
claims atômicas, recibos do agente e conversão térmica para Shopee. A inclusão
precisava reutilizar essas peças e estender as proteções de ativação/loja ao TikTok.

Cada cliente autoriza sua própria loja via OAuth de vendedor BR; o cliente não
cria um app nem fornece senha ao LabelGo. O state é obrigatório e validado pelo
callback existente. O backend assina as requisições com HMAC-SHA256, valida os
escopos e mantém IDs de 64 bits como strings. O cipher da loja é resolvido a
partir da lista de lojas autorizadas do token, nunca da URL de callback.

Tokens usam a criptografia existente. A expiração absoluta em segundos do TikTok
é convertida para milissegundos. A renovação tem lock PostgreSQL por conta para
impedir duas réplicas de rotacionarem o mesmo refresh token. Após adquirir o lock,
o backend relê a conta; uma requisição concorrente ocupada é retomada na próxima
consulta/varredura. Os tokens rotacionados são persistidos antes de novas consultas.

O poller TikTok usa seu próprio lock distribuído e varredura de 60 segundos,
independente do Mercado Livre e da Shopee. Ele só considera pacotes TikTok Shipping,
fulfillment pelo vendedor, status PROCESSING/RTS, pedidos sem cancelamento pendente
e NF `NO_NEED` ou `INVOICE_UPLOADED`. O backend não organiza envio, compra frete,
emite NF ou altera pedidos.

A primeira descoberta completa salva os pacotes existentes como exclusões por
loja/ativação e não solicita etiquetas. Depois, todos os pedidos do pacote precisam
ter criação estritamente posterior à ativação, inclusive em pacotes combinados.
Essa verificação é repetida antes do download. Pedidos antigos sem pacote no
primeiro snapshot também ficam protegidos pela data original do pedido.
Paginação incompleta, cursor repetido ou limite de segurança impedem ativação.

A unidade de deduplicação é o pacote, com usuário, provider e conta. A fila existente
revalida loja ativa, proprietário, impressão habilitada e geração na inserção e na
claim. Mantivemos os nomes SQL históricos `shopee_auto_print_state` e
`shopee_generation` para reutilizar o armazenamento sem perder estado já instalado.
Não houve migração de dados operacionais de ML/Shopee.

Etiquetas são solicitadas como SHIPPING_LABEL/PDF/A6, com tamanho máximo de 10 MB,
uma página e dimensões térmicas compatíveis. URLs HTTPS ficam restritas aos CDNs
ByteDance configurados no código, sem redirects ou envio de credenciais ao CDN.
O PDF permanece na fila: agentes com suporte PDF recebem o documento; os demais
recebem ZPL gerado no backend pela conversão já usada na Shopee, em 203/300 DPI
conforme a configuração existente. Essa escolha preserva tamanho e fontes usando
o renderer já corrigido/testado, sem depender do DPI do ZPL nativo do TikTok.

**Não é necessário atualizar o agente nem selecionar outra impressora.** O agente
usa o mesmo token, impressora configurada, job ID e protocolo de confirmação.

Há três reservas de preparação por pacote/ativação, persistidas no PostgreSQL,
com intervalos de 2 e 4 minutos antes das próximas tentativas. Uma chamada de
leitura transitória tem no máximo três tentativas HTTP. Conversões que falham antes
da entrega usam o limite/backoff existentes. Se a resposta ao agente se perder,
o resultado é incerto: a etiqueta vai para revisão, nunca para reimpressão cega.
Confirmações tardias são aceitas; um erro tardio não desfaz uma confirmação.

A impressão manual usa o endpoint PDF existente e permite repetir explicitamente
uma etiqueta. Pacotes confirmados pelo agente aparecem em Reimpressão enquanto
continuarem disponíveis no TikTok. Downloads manuais em lote falham por inteiro
se algum pacote não puder ser validado. O TikTok bloqueia documentos de pacotes
já coletados/cancelados; essa restrição do marketplace é respeitada.

## Arquivos

| Grupo | Arquivos |
| --- | --- |
| API TikTok e provider | `server/src/services/tiktok.ts`, `server/src/providers/tiktok.ts` |
| Registro e contrato | `server/src/providers/index.ts`, `server/src/providers/types.ts` |
| Fila, ativação, tentativas e locks | `server/src/db.ts`, `server/migrations/0018_tiktok_label_attempts.sql` |
| Polling e compatibilidade do agente | `server/src/jobs/autoPrintPoller.ts`, `server/src/services/agentPrintJobs.ts` |
| Renovação de tokens e dashboard | `server/src/services/accounts.ts`, `server/src/routes/shipments.ts`, `server/src/routes/autoPrint.ts` |
| Interface | `client/src/pages/Settings.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/components/Header.tsx`, `client/src/components/MarketplaceLogo.tsx` |
| Configuração | `.env.example` |
| Testes TikTok | `server/src/__tests__/tiktok.test.ts`, `tiktok-poller.test.ts`, `tiktokQueue.integration.test.ts` |
| Regressões/compatibilidade | `server/src/__tests__/agentPrintJobs.test.ts`, `printQueue.test.ts`, `client/src/pages/__tests__/DashboardFilters.test.tsx`, `SettingsTikTok.test.tsx` |

## Ativação após aprovação e validação real

1. Concluir as revisões e permissões exigidas pelo TikTok, sem declarar controles
   de segurança não verificados no questionário.
2. Configurar o callback e somente no backend: `TIKTOK_APP_KEY`,
   `TIKTOK_APP_SECRET`, `TIKTOK_SERVICE_ID`. Manter `TIKTOK_ENABLED=0` até o piloto.
3. Com autorização para publicar, aplicar as migrations e publicar o backend/client.
   O único DDL novo é a tabela de controle de preparação de etiquetas.
4. Habilitar `TIKTOK_ENABLED=1` no ambiente de teste/piloto e conectar uma loja BR
   pelo botão TikTok Shop nas configurações existentes. Não refazer pareamento.
5. A primeira varredura exclui o histórico. Validar com um pedido NOVO, preparado
   no fluxo logístico/fiscal normal do vendedor, e conferir PDF, tamanho, fontes,
   códigos de barras, impressora e recibo antes de liberar para outros clientes.
6. O opt-in e o plano de impressão automática já existentes continuam obrigatórios.
   `TIKTOK_ENABLED=0` suspende novas buscas e claims TikTok sem alterar ML/Shopee.
   Trabalhos já entregues ao agente podem concluir e confirmar normalmente.

## Limitações e validação pendente

- Escopo inicial: vendedores locais BR e TikTok Shipping; Seller Shipping, FBT,
  criadores e cross-border não entram neste fluxo.
- Uma conexão precisa retornar exatamente uma loja BR. Grants com várias lojas BR
  são rejeitados explicitamente; não há seleção silenciosa de outra loja.
- A paginação tem limite de 100 páginas de 100 pedidos; uma descoberta incompleta
  bloqueia o snapshot, sem imprimir histórico.
- Hosts reais de documentos, PDF real, autorização real e impressão física ainda
  precisam ser validados após liberação do TikTok. Mocks não comprovam esses passos.
- Quando a preparação falha três vezes, a impressão automática daquele pacote é
  interrompida; download manual continua disponível se o marketplace permitir.
- O audit atual encontrou 73 ocorrências (3 baixas, 45 moderadas, 19 altas e 6
  críticas) na árvore de dependências existente. Nenhuma dependência ou lockfile foi
  alterado nesta implementação; a atualização deve ser tratada separadamente.

## Validação automatizada

Resultado: **273 testes backend, 38 testes frontend e 11 testes do agente
aprovados, sem testes ignorados nessas execuções; build completo aprovado.**

O cartão TikTok Shop aparece após Shopee em Configurações → Marketplaces, com
botão explícito **Conectar TikTok Shop**. O botão inicia o OAuth existente e
retorna a `/configuracoes`. Enquanto a integração não estiver configurada e
habilitada, o cartão permanece visível com o botão desabilitado e explicação.
Os testes da tela cobrem início da autorização, indisponibilidade, conta conectada
e falha do OAuth. Esta interface ainda precisa ser publicada para aparecer no site.

- Backend: suíte completa com PostgreSQL local em banco descartável exclusivo;
  inclui isolamento por schema, claims concorrentes, escopo por usuário/loja,
  reativação, retries persistidos, confirmação tardia e regressões ML/Shopee.
- Teste completo TikTok: API simulada → snapshot sem impressão → pedido novo →
  PDF na fila → conversão REAL para ZPL a 300 DPI → confirmação → nenhuma duplicata.
- Rotação de refresh token concorrente validada com locks reais do PostgreSQL.
- Frontend: filtros TikTok, seleção e reimpressão junto das regressões existentes.
- Agente: suíte existente executada com adapters simulados, sem alteração do código.
- Build completo de client/SSR e server; migrations de instalação nova, atualização
  0017→0018 preservando impressora/DPI/ML/Shopee e reexecução idempotente.

Para repetir o backend com integração, fornecer `TEST_DATABASE_URL` apontando
EXCLUSIVAMENTE para banco descartável. Nunca usar o banco da aplicação.

```sh
TEST_DATABASE_URL=postgres://localhost/labelgo_tiktok_disposable npm run test --workspace=server
npm run test --workspace=client
npm test --prefix agent
npm run build
```

## Referências oficiais

- https://partner.tiktokshop.com/docv2/page/authorization-overview-202407
- https://partner.tiktokshop.com/docv2/page/sign-your-api-request
- https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
- https://partner.tiktokshop.com/docv2/page/get-order-list-202309
- https://partner.tiktokshop.com/docv2/page/get-order-detail-202309
- https://partner.tiktokshop.com/docv2/page/get-package-detail-202309
- https://partner.tiktokshop.com/docv2/page/get-package-shipping-document-202309
- https://partner.tiktokshop.com/docv2/page/br-market-updated-api-workflow-to-support-order-invoice-and-warehouse
