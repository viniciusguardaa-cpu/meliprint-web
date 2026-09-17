# LabelGo Agent — Instalador Windows

O instalador `LabelGoAgent-Setup.exe` entrega o agente sem exigir Node.js,
terminal ou edição de `.env` pelo cliente.

## Fluxo do cliente

1. Na página Impressão Automática clica em **Baixar LabelGo Agent (Windows)**
   e executa `LabelGoAgent-Setup.exe` (instalação por usuário, sem admin).
2. No painel do LabelGo (Impressão Automática) clica em **Gerar código de pareamento**.
3. Ao fim da instalação, marca "Configurar o LabelGo Agent agora" e digita o código.
4. Escolhe a impressora, imprime a etiqueta de teste.
5. O agente passa a iniciar sozinho junto com o Windows (chave `Run` do HKCU).

## Hospedagem do instalador

O botão de download aponta para `/downloads/LabelGoAgent-Setup.exe` por padrão.
Para publicar, copie `installer\Output\LabelGoAgent-Setup.exe` para
`client/public/downloads/` antes do deploy do client (Netlify serve o arquivo
direto, sem passar pelo redirect do SPA). Para hospedar em outro lugar
(GitHub Releases, S3 etc.), defina `VITE_AGENT_DOWNLOAD_URL` no build do client.

## Build (requer Windows)

```powershell
cd agent
npm ci
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

O script:

1. `npx @yao-pkg/pkg package.json --targets node18-win-x64 --output dist\labelgo-agent.exe`
   — empacota `agent.js` e todos os módulos ESM em um único exe.
2. `iscc installer\LabelGoAgent.iss` — compila `installer\Output\LabelGoAgent-Setup.exe`.

Requisitos da máquina de build (somente build, não do cliente):

- Node.js 18+
- Inno Setup 6 (`iscc.exe` no PATH ou em `%ProgramFiles(x86)%\Inno Setup 6`)

## Alternativa sem instalador (dev/suporte)

```powershell
# Qualquer máquina Windows com Node 18+
node agent.js --setup
```

Ou via variáveis de ambiente / `.env` (legado):

```
LABELGO_SERVER_URL=https://app.labelgo.com.br
LABELGO_AGENT_TOKEN=<token gerado pelo código de pareamento>
LABELGO_PRINTER_NAME=Zebra_ZD420
```

## Validação pendente (requer Windows real)

- [ ] Compilar `labelgo-agent.exe` com @yao-pkg/pkg (ESM suportado nas versões ≥6 do fork).
- [ ] Compilar `LabelGoAgent-Setup.exe` com Inno Setup 6.
- [ ] Instalar em Windows limpo → wizard `--setup` executa, pareamento funciona.
- [ ] Impressora física ZPL: etiqueta de teste sai.
- [ ] Reiniciar Windows → agente sobe sozinho (HKCU Run key).
