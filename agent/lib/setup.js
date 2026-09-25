/**
 * First-run setup wizard (`agent.js --setup`):
 *   server URL → pairing code → select printer → test label → autostart.
 * Writes config.json in the platform state dir — no .env editing required.
 */
import { createInterface } from 'readline';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { pairWithCode } from './api.js';
import { saveConfig } from './config.js';
import { getStateDir } from './paths.js';

const execFileAsync = promisify(execFile);

const TEST_ZPL = '^XA^FO50,50^A0N,50,50^FDLabelGo Test^FS^FO50,120^A0N,30,30^FDLabel OK^FS^XZ';

function prompt(rl, question, fallback) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim() || fallback);
    });
  });
}

async function registerAutostart(config) {
  if (process.platform === 'win32') {
    // HKCU Run key — starts the agent at login. When packaged as an exe,
    // process.execPath IS the agent binary; under `node agent.js` we register
    // node + script path instead.
    const isPackaged = !process.argv[1] || !process.argv[1].endsWith('.js');
    const command = isPackaged
      ? `"${process.execPath}"`
      : `"${process.execPath}" "${process.argv[1]}"`;
    try {
      await execFileAsync('reg', [
        'add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v', 'LabelGoAgent', '/t', 'REG_SZ', '/d', command, '/f',
      ], { timeout: 10000 });
      return { ok: true, detail: 'Inicialização automática registrada (Windows Run key).' };
    } catch (err) {
      return { ok: false, detail: `Não foi possível registrar o autostart: ${err.message}` };
    }
  }
  return {
    ok: false,
    detail: 'Neste sistema, configure a inicialização automática manualmente ' +
      '(macOS: launchd; Linux: systemd). Veja agent/README.md.',
  };
}

export async function runSetup(adapter) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   LabelGo Agent — configuração inicial   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    const serverUrl = (await prompt(
      rl,
      'URL do servidor LabelGo [https://labelgo.com.br]: ',
      'https://labelgo.com.br'
    )).replace(/\/$/, '');

    console.log('');
    console.log('No painel do LabelGo (Impressão Automática), clique em');
    console.log('"Gerar código de pareamento" e digite o código abaixo.');
    const code = await prompt(rl, 'Código de pareamento: ');
    if (!code) {
      console.error('❌ Código obrigatório.');
      process.exit(1);
    }

    console.log('⏳ Pareando com o servidor...');
    const paired = await pairWithCode(serverUrl, code);
    console.log('✅ Agente pareado!');

    // Printer selection
    console.log('');
    console.log(`🔍 Detectando impressoras (${adapter.name})...`);
    const printers = await adapter.listPrinters();
    let printerName = paired.printerName;

    if (printers.length === 0) {
      console.log('   Nenhuma impressora detectada automaticamente.');
      printerName = printerName || await prompt(rl, 'Nome da impressora: ');
    } else {
      printers.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
      const defaultIdx = printerName ? printers.indexOf(printerName) + 1 : 1;
      const choice = await prompt(
        rl,
        `Escolha a impressora [${defaultIdx > 0 ? defaultIdx : 1}]: `,
        String(defaultIdx > 0 ? defaultIdx : 1)
      );
      const idx = Number(choice);
      if (Number.isInteger(idx) && idx >= 1 && idx <= printers.length) {
        printerName = printers[idx - 1];
      } else {
        printerName = choice; // allow typing a custom name
      }
    }

    if (!printerName) {
      console.error('❌ Impressora obrigatória.');
      process.exit(1);
    }

    // Test label
    const wantsTest = await prompt(rl, `Imprimir etiqueta de teste em "${printerName}"? [S/n]: `, 's');
    if (/^s/i.test(wantsTest)) {
      try {
        await adapter.printZpl(printerName, TEST_ZPL);
        console.log('   ✅ Etiqueta de teste enviada! Verifique a impressora.');
      } catch (err) {
        console.error(`   ❌ Falha no teste: ${err.message}`);
      }
    }

    const config = saveConfig({
      serverUrl,
      agentToken: paired.agentToken,
      printerName,
      agentId: paired.agentId || `agent-${randomUUID().slice(0, 8)}`,
    });

    // Autostart
    const autostart = await registerAutostart(config);
    console.log(autostart.ok ? `✅ ${autostart.detail}` : `⚠️  ${autostart.detail}`);

    console.log('');
    console.log(`✅ Configuração salva em ${getStateDir()}/config.json`);
    console.log('   O agente já pode ser iniciado. Deixe-o rodando para imprimir');
    console.log('   automaticamente quando o Mercado Livre liberar etiquetas.');
  } finally {
    rl.close();
  }
}
