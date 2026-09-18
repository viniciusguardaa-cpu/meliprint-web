# LabelGo Web

Aplicação web para impressão rápida de etiquetas do Mercado Livre em formato ZPL/PDF, direto do navegador.

## Funcionalidades

- **Login OAuth** com Mercado Livre (PKCE)
- **Listagem de envios** prontos para impressão
- **Seleção em lote** de etiquetas
- **Impressão pelo navegador** (PDF) — sem instalar nada
- **Download ZPL** para impressoras térmicas
- **Fila por prazo de despacho** e **conferência antes de imprimir** (Pro)
- **Impressão automática** via agente local opcional (Pro)

## Requisitos

- Node.js 18+
- App registrado no [Mercado Livre Developers](https://developers.mercadolivre.com.br/)

## Configuração

1. Clone o repositório
2. Copie `.env.example` para `.env` e preencha:

```env
ML_CLIENT_ID=seu_client_id
ML_CLIENT_SECRET=seu_client_secret
ML_REDIRECT_URI=http://localhost:3001/api/auth/callback
SESSION_SECRET=uma_chave_secreta_qualquer
FRONTEND_URL=http://localhost:5173
```

3. No painel do Mercado Livre, configure a **Redirect URI** como:
   - Desenvolvimento: `http://localhost:3001/api/auth/callback`
   - Produção: `https://seu-app.railway.app/api/auth/callback`

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Build

```bash
npm run build
```

## Deploy no Railway

1. Crie um novo projeto no [Railway](https://railway.app)
2. Conecte o repositório GitHub
3. Configure as variáveis de ambiente:
   - `ML_CLIENT_ID`
   - `ML_CLIENT_SECRET`
   - `ML_REDIRECT_URI` (use a URL do Railway)
   - `SESSION_SECRET`
   - `FRONTEND_URL` (mesma URL do Railway)
   - `NODE_ENV=production`
4. Deploy automático

## Agente de impressão (AutoPrint)

O agente roda no computador ligado à impressora térmica e imprime etiquetas
assim que o Mercado Livre as libera.

### Cliente final (Windows)

O cliente não precisa de Node, terminal ou `.env`:

1. Baixa `LabelGoAgent-Setup.exe` pelo botão na página de Impressão Automática
   (o CI em `.github/workflows/agent-installer.yml` compila e publica no
   release `agent-latest`; para build manual, ver `agent/installer/`).
2. No painel (Impressão Automática) gera o **código de pareamento**.
3. O wizard do instalador pede o código, lista as impressoras, imprime uma
   etiqueta de teste e agenda o início automático junto ao Windows.

### Desenvolvimento / instalação manual

```bash
cd agent
npm install
node agent.js --setup          # wizard: pareamento + impressora + teste
node agent.js                  # modo normal
node agent.js --check          # smoke check (CI)
node agent.js --list-printers
node agent.js --test-print <impressora>
npm test                       # testes node:test (recibos, confirmação)
```

Configuração também aceita `agent/.env` ou variáveis `LABELGO_*`
(`LABELGO_SERVER_URL`, `LABELGO_AGENT_TOKEN`, `LABELGO_PRINTER_NAME`,
`LABELGO_POLL_INTERVAL`, `LABELGO_STATE_DIR`). Legado `PRINTLY_*` e
`MELIPRINT_*` continuam funcionando.

Comportamento de confiabilidade: o agente grava um recibo local após o spooler
aceitar a etiqueta; se a confirmação ao servidor falhar (rede, restart), só a
confirmação é retentada — a etiqueta nunca é reimpressa sozinha. Jobs com
resultado incerto ficam `needs_review` para conferência no painel.

### Variáveis de ambiente adicionais (server)

```env
DATABASE_URL=postgres://...
MP_ACCESS_TOKEN=...            # Mercado Pago (assinaturas)
MP_WEBHOOK_SECRET=...          # assinatura do webhook MP (obrigatório em prod)
# MP_WEBHOOK_ALLOW_UNSIGNED=1  # só dev — nunca em produção
ADMIN_SECRET=...               # chave do painel /admin
ENCRYPTION_KEY=...             # criptografia de tokens ML
REDIS_URL=...                  # opcional; sessão cai para Postgres
```

### Migrações e testes com Postgres descartável

```bash
bash server/scripts/test-migrations.sh          # fresh + upgrade + idempotência
TEST_DATABASE_URL=postgres://... npm test --workspace=server  # inclui teste real de migrations
```

## Estrutura

```
labelgo-web/
├── client/          # Frontend React + Vite
│   ├── src/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
├── server/          # Backend Express
│   ├── src/
│   │   ├── routes/
│   │   ├── jobs/    # poller ML, reconciler de cobrança
│   │   └── services/
│   ├── migrations/  # SQL versionado (schema_migrations)
│   └── package.json
├── agent/           # Agente de impressão (macOS/Linux/Windows)
│   ├── lib/         # config, api, jobs, recibos, setup wizard
│   ├── printers/    # adapters CUPS / Windows
│   └── installer/   # build exe + Inno Setup (Windows)
└── package.json     # Workspace root
```

## API Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/auth/login` | GET | Inicia OAuth |
| `/api/auth/callback` | GET | Callback do OAuth |
| `/api/auth/me` | GET | Dados do usuário logado |
| `/api/auth/logout` | POST | Encerra sessão |
| `/api/shipments` | GET | Lista envios |
| `/api/labels/zpl` | POST | Gera etiquetas ZPL |

## Licença

MIT
