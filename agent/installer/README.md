# LabelGo Agent — Instalador Windows

O instalador `LabelGoAgent-Setup.exe` é um app Electron empacotado com
`electron-builder` (NSIS). Instalação por usuário, sem admin, sem Node.js
e sem terminal — o pareamento acontece dentro do app.

## Fluxo do cliente

1. Na página Impressão Automática clica em **Baixar LabelGo Agent (Windows)**
   e executa `LabelGoAgent-Setup.exe`.
2. No painel do LabelGo (Impressão Automática) clica em **Gerar código de pareamento**.
3. No app, digita o código de 6 dígitos, escolhe a impressora e imprime o teste.
4. O agente roda na bandeja do Windows e inicia junto com o sistema
   (login item / configurável na tela de setup).

## Hospedagem do instalador

O workflow `.github/workflows/agent-installer.yml` (runner Windows) compila
`LabelGoAgent-Setup.exe` e publica no release `agent-latest` do GitHub —
roda automaticamente em pushes na `main` que tocam `agent/` e também pode
ser disparado manualmente em Actions → "Agent Installer".

O botão de download no app aponta para `/downloads/LabelGoAgent-Setup.exe`;
o `netlify.toml` redireciona (301) esse caminho para o asset do release.

## Build manual (requer Windows)

```powershell
cd agent
npm ci
npx electron-builder --win nsis --publish never
# saída: agent/dist/LabelGoAgent-Setup.exe
```

Requisitos da máquina de build (somente build, não do cliente):

- Node.js 18+

## Sem instalador (dev/suporte)

```powershell
# Qualquer máquina Windows com Node 18+
node agent.js --setup     # modo CLI/headless
npm start                 # modo desktop (Electron, requer npm i)
```

## Pendente

- [ ] Assinatura de código (hoje o SmartScreen pode avisar no primeiro run).
- [ ] Ícone `.ico` dedicado (hoje derivado do PNG de 512px).
