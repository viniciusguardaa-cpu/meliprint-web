# Shopee: impressão automática pelo agente existente

Branch: `feat/shopee-auto-print`.
Base local: `f1632c5` (checkout isolado das alterações pré-existentes).
Data: 24/11/2026. Estado inicial da implementação local: sem deploy, push, alteração de banco real ou impressão física. A publicação autorizada é registrada ao final deste relatório.

## Diagnóstico e arquitetura

O código já implementava impressão automática Shopee em PDF. O bloqueio encontrado para agentes antigos é a negociação de formatos: eles retiram somente ZPL; a Shopee fornece PDF. A presença da etiqueta na dashboard não implica que o agente antigo possa recebê-la. Agentes PDF-capazes já tinham um caminho implementado. A versão/configuração instalada em cada computador não foi consultada.

**Mercado Livre:** webhook `POST /api/notifications` registra cada entrega em `ml_notifications`; resolve a conta pelo vendedor; verifica Pro/ativação; confirma `ready_to_ship/ready_to_print`; baixa um ZPL por envio; insere em `print_queue`. O poller de 60 segundos reconcilia falhas e retenta notificações persistidas. A unicidade evita enfileiramento repetido. O agente retira jobs por `POST /api/auto-print/queue/claim` (ou GET legado), imprime na impressora configurada, grava recibo local e confirma em `/:id/printed`. O claim usa `FOR UPDATE SKIP LOCKED`; o worker usa advisory locks entre réplicas. Heartbeat indica presença do agente. Claims vencidos vão para revisão.

**Shopee:** `services/shopee.ts` consulta pedidos e documentos com credenciais da loja. O provider normaliza os dados para `GET /api/shipments`. Dashboard e impressão manual dependem da NF válida, pedido PROCESSED, todos os pacotes READY e PDFs válidos. Há cache positivo de PDFs por loja/pedido/pacote por 60 segundos, invalidado no download. Não há um armazenamento permanente separado das etiquetas da dashboard. Na impressão automática o PDF é persistido em base64 na coluna de payload já existente da mesma `print_queue`.

O ciclo Shopee de 60 segundos permanece separado do ciclo de reconciliação ML. As opções de organizar envio existentes continuam opt-in; esta mudança não habilita organização de envio, criação de NF ou novos serviços logísticos.

## Solução implementada

- Agentes que anunciam PDF recebem o PDF original, pelo caminho já existente.
- Para agentes antigos, o backend renderiza o PDF em ZPL `^GFA/:Z64`, em worker thread. Job ID, autenticação, endpoints, claim, recibos e confirmação são os mesmos.
- O worker inclui todas as páginas/pacotes, ajusta proporcionalmente para 4x6, usa 203 DPI por padrão e permite 300 DPI na configuração do cliente (`POST /api/auto-print/printer`, junto de `printerName` e `labelDpi`). Não troca a impressora do agente. O formato 4x6 acompanha os adaptadores existentes.
- PDF continua sendo o payload armazenado; a conversão ocorre somente na entrega ao agente legado. Mercado Livre continua recebendo seu ZPL original sem renderização.
- Unicidade Shopee passa a incluir usuário, provider, loja e pedido. Inserção e claim verificam propriedade da conta, status ativo, ativação e geração atual de impressão. Não basta uma checagem anterior à chamada da API.
- A geração muda quando a impressão é desativada e reativada. Reparear ou editar a impressora com a impressão já ativa não reinicia o marco.
- Na primeira descoberta completa de cada ativação/loja, salva-se uma lista de exclusão. Esse ciclo não enfileira etiquetas. A lista inclui documentos ainda indisponíveis e pedidos aguardando organização de envio.
- Listagens incompletas, malformadas, cursores ausentes/repetidos ou acima dos limites impedem a inicialização. São aceitos até 2.000 pedidos de cada listagem, com paginação completa; acima disso permanece pausado, sem snapshot parcial.
- Também se exige que a criação do pedido seja posterior ao marco da primeira descoberta completa. Pedidos antigos fora da janela inicial não entram automaticamente quando recebem uma atualização. Sem data de criação confirmada, o pedido fica fora da impressão automática.
- A migration põe PDFs Shopee antigos sem identificação de loja em revisão. Jobs de ativações anteriores não são entregues automaticamente. As etiquetas antigas continuam disponíveis para impressão/reimpressão manual pela dashboard; a mudança não tenta adivinhar a loja de registros antigos sem escopo.

## Falhas, retentativas e duplicidade

- Conversão falhou antes da entrega ao agente: até 3 tentativas, com backoff de 15/30/60 segundos; depois `failed`.
- Reporte repetido da mesma falha não incrementa tentativas enquanto o job não estiver novamente em processamento.
- Erro reportado pelo agente Shopee: `needs_review`, pois pode haver envio parcial ao spooler. Não se assume que seja seguro imprimir novamente.
- Resposta de claim perdida ou agente sem comunicação: timeout de claim existente leva a revisão, sem reimpressão automática.
- Impressão aceita e confirmação perdida: o recibo local existente retenta somente a confirmação, inclusive após reinício.
- Uma falha tardia não desfaz um job Shopee já confirmado. Confirmações repetidas continuam aceitas.
- Retry/requeue explícito dos jobs com loja identificada continua disponível ao dono, inclusive para uma ativação anterior. A impressão/reimpressão manual pelo navegador mantém o comportamento atual.
- As regras de falha/retentativa originais do Mercado Livre foram preservadas.

## Validação realizada

| Verificação | Resultado |
|---|---|
| Servidor local (Vitest) | 208 passaram; 7 ficaram condicionados a PostgreSQL descartável |
| Servidor no CI com PostgreSQL | 215 passaram, sem testes pulados; migrations fresh/upgrade/idempotência passaram |
| Integração com mocks | Poller → endpoints reais → renderização real quando necessária → agente original → spooler simulado → confirmação; PDF e legado passaram |
| Rede após confirmação | Resposta perdida após commit simulado; confirmação retentada e um único envio ao spooler |
| Regressão ML | Webhook/reprocessamento, ZPL original, elegibilidade e falhas transitórias passaram |
| Client (Vitest) | 33 passaram |
| Agente (node:test), sem modificar o agente | 11 passaram |
| Typecheck server e client | Passaram |
| Build completo | Passou |
| Smoke `node agent/agent.js --check` | Passou, sem impressora/token configurados no checkout de teste |
| `git diff --check` | Passou |

Os fixtures são PDFs sintéticos; nenhuma etiqueta real de cliente foi baixada para os testes. Não houve acesso a banco/Redis de produção nem envio a uma impressora real.

**Limite da validação:** o PostgreSQL descartável não iniciou neste ambiente: `could not create shared memory segment: Operation not permitted (shmget)`. Por isso os seis novos testes SQL de concorrência/isolamento e o teste de migrations já existente não foram executados localmente. Os testes foram adicionados ao conjunto executado pelo CI quando `TEST_DATABASE_URL` está definido. Essa limitação foi resolvida na etapa de publicação: o CI remoto executou e aprovou todos os 215 testes com PostgreSQL e os cenários de migrations ([run 45423214783](https://github.com/viniciusguardaa-cpu/meliprint-web/actions/runs/45423214783)). O banco real detectou ambiguidade de tipos no INSERT; foram adicionados casts explícitos antes da aprovação.

Comandos usados, a partir da raiz do checkout:

```sh
DATABASE_URL=postgres://invalid:invalid@127.0.0.1:1/test REDIS_URL= npm test --workspace=server
npm test --workspace=client
npm test --prefix agent
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json
npm run build
node agent/agent.js --check
git diff --check
```

Para o CI ou outro ambiente de testes, usar exclusivamente PostgreSQL descartável:

```sh
TEST_DATABASE_URL=postgres://.../labelgo_test npm test --workspace=server
DATABASE_URL=postgres://.../labelgo_test bash server/scripts/test-migrations.sh
```

## Agente e requisitos para liberação

Não foi alterado nenhum arquivo em `agent/`, e a solução não exige atualização do agente para impressoras que já aceitam o ZPL raster utilizado. Agentes atuais PDF-capazes continuam usando impressão PDF pelo driver.

A compatibilidade legada tem limites explícitos: PDF de até 10 MiB, até 10 páginas, renderização em até 10 segundos e ZPL de até 24.000 caracteres para respeitar o transporte por variável de ambiente dos agentes Windows existentes. PDFs que excedam o limite não são truncados nem parcialmente impressos; o job falha de forma controlada. Esses casos, ou impressoras sem suporte a `^GFA/:Z64`, exigem o agente PDF-capaz ou impressão manual. Não foi feita homologação física de modelos de impressora.

O backend requer Node 22 e as dependências `pdfjs-dist`/`@napi-rs/canvas`, fixadas no lockfile. O arquivo `server/workers/pdfToZpl.mjs` deve acompanhar o backend. CI e Nixpacks foram alinhados para Node 22. É necessária a migration `0017_shopee_auto_print.sql`.

A migration substitui o índice de unicidade da fila; o release deverá coordenar a atualização dos processos de backend, pois código antigo usa um alvo de `ON CONFLICT` diferente. Não aplicar isoladamente em produção mantendo processos antigos ativos. A validação de migrations/concorrência em PostgreSQL passou no CI. A homologação física não foi realizada, pois nenhum teste deve acionar impressoras reais. O usuário autorizou a publicação em 24/11/2026. A liberação é feita em duas etapas: primeiro os INSERTs da versão anterior passam a usar `ON CONFLICT DO NOTHING`, compatível com ambos os esquemas; somente após esse backend estar ativo é liberada a migration e a funcionalidade completa.

## Arquivos alterados e adicionados
- `README.md`
- `.github/workflows/ci.yml`
- `docs/shopee-auto-print.md`
- `nixpacks.toml`
- `package-lock.json`
- `package.json`
- `server/migrations/0017_shopee_auto_print.sql`
- `server/package.json`
- `server/src/__tests__/agentPrintJobs.test.ts`
- `server/src/__tests__/labelFixture.ts`
- `server/src/__tests__/mlAutoPrint.regression.test.ts`
- `server/src/__tests__/pdfToZpl.test.ts`
- `server/src/__tests__/printQueue.test.ts`
- `server/src/__tests__/shopee-agent-flow.integration.test.ts`
- `server/src/__tests__/shopee-baseline.test.ts`
- `server/src/__tests__/shopee-poller.test.ts`
- `server/src/__tests__/shopeeAutoPrint.test.ts`
- `server/src/__tests__/shopeeQueue.integration.test.ts`
- `server/src/db.ts`
- `server/src/jobs/autoPrintPoller.ts`
- `server/src/providers/shopee.ts`
- `server/src/providers/types.ts`
- `server/src/routes/autoPrint.ts`
- `server/src/services/agentPrintJobs.ts`
- `server/src/services/pdfToZpl.ts`
- `server/src/services/shopee.ts`
- `server/workers/pdfToZpl.mjs`

## Tentativa de publicação — 24/11/2026

Publicação autorizada pelo usuário. O acesso GitHub conectado recusou a criação de árvore Git com HTTP 403 (`Resource not accessible by integration`); Git/Railway via terminal não conseguiram acessar a rede. O navegador abriu o repositório, mas a sessão GitHub está desconectada. Nenhuma alteração foi publicada nessa primeira tentativa. Após o login do usuário, o envio foi concluído pelo navegador na branch `feat/shopee-agent-release-20261124`.

## Publicação autorizada — 24/11/2026

- Release completo: [PR #61](https://github.com/viniciusguardaa-cpu/meliprint-web/pull/61).
- Compatibilidade prévia da fila: [PR #62](https://github.com/viniciusguardaa-cpu/meliprint-web/pull/62), integrado como `999e798a1d7b1f7b44eb5bdb5304198b2adf3bdd`. A versão anterior continua usando os mesmos INSERTs e deduplicação com alvo de conflito genérico.
- Os 27 arquivos enviados foram comparados por hash com os arquivos locais; todos coincidiram antes desta atualização documental.
- CI completo aprovado: 215 testes de servidor, 11 de agente, migrations, typechecks e build. Os 33 testes do client também haviam passado localmente.
- A segunda etapa só será integrada após o Railway confirmar a primeira versão ativa. Nenhum agente local foi alterado.
