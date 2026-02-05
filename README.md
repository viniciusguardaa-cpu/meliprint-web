# MeliPrint Web

Aplicação web para impressão rápida de etiquetas do Mercado Livre em formato ZPL.

## Funcionalidades

- **Login OAuth** com Mercado Livre (PKCE)
- **Listagem de envios** prontos para impressão
- **Seleção em lote** de etiquetas
- **Download ZPL** para impressoras térmicas

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

## Estrutura

```
meliprint-web/
├── client/          # Frontend React + Vite
│   ├── src/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
├── server/          # Backend Express
│   ├── src/
│   │   ├── routes/
│   │   └── services/
│   └── package.json
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
