#!/usr/bin/env node
/**
 * LabelGo Agent — impressão automática de etiquetas do Mercado Livre.
 *
 * Cross-platform: macOS (CUPS), Linux (CUPS), Windows (RawPrinterHelper).
 *
 * Uso:
 *   node agent.js / labelgo-agent.exe        # modo normal (config salva por --setup)
 *   node agent.js --setup                    # wizard: pareamento + impressora + teste
 *   node agent.js --list-printers            # lista impressoras disponíveis
 *   node agent.js --test-print <printer>     # imprime etiqueta de teste
 *   node agent.js --check                    # verifica inicialização (CI/smoke)
 *
 * Configuração (ordem): variáveis de ambiente LABELGO_*, config.json no
 * diretório de estado, .env na pasta do agente. O instalador usa --setup.
 */
import { randomUUID } from 'node:crypto';
import { getPrinterAdapter } from './printers/index.js';
import { loadConfig } from './lib/config.js';
import { getStateDir, ensureStateDir } from './lib/paths.js';
import { claimJobs, sendHeartbeat } from './lib/api.js';
import { processJob, flushPendingConfirmations } from './lib/jobs.js';
import { runSetup } from './lib/setup.js';
import { listPendingReceipts } from './lib/store.js';

const adapter = getPrinterAdapter();
const TEST_ZPL = '^XA^FO50,50^A0N,50,50^FDLabelGo Test^FS^FO50,120^A0N,30,30^FDLabel OK^FS^XZ';

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--list-printers')) {
  console.log(`🔍 Listando impressoras (${adapter.name})...`);
  adapter.listPrinters().then(printers => {
    if (printers.length === 0) {
      console.log('   Nenhuma impressora encontrada.');
    } else {
      console.log('   Impressoras disponíveis:');
      for (const p of printers) console.log(`   - ${p}`);
    }
    process.exit(0);
  });
} else if (args.includes('--test-print')) {
  const printerIdx = args.indexOf('--test-print');
  const printer = args[printerIdx + 1] || loadConfig().printerName;
  if (!printer) {
    console.error('❌ Especifique a impressora: agent.js --test-print <printer>');
    process.exit(1);
  }
  console.log(`🖨️  Imprimindo etiqueta de teste em ${printer}...`);
  adapter.printZpl(printer, TEST_ZPL).then(() => {
    console.log('   ✅ Etiqueta de teste enviada!');
    process.exit(0);
  }).catch(err => {
    console.error('   ❌ Erro:', err.message);
    process.exit(1);
  });
} else if (args.includes('--setup') || args.includes('--pair')) {
  runSetup(adapter).then(() => process.exit(0)).catch(err => {
    console.error(`❌ Setup falhou: ${err.message}`);
    process.exit(1);
  });
} else if (args.includes('--check')) {
  runCheck().then(code => process.exit(code));
} else {
  runAgent();
}

// ---------------------------------------------------------------------------
// Startup check — verifies modules, adapter and config without printing.
// Exit 0 = agente consegue iniciar; exit 1 = falha de inicialização.
// ---------------------------------------------------------------------------

async function runCheck() {
  const problems = [];
  const warnings = [];

  try {
    ensureStateDir();
  } catch (err) {
    problems.push(`state dir: ${err.message}`);
  }

  const config = loadConfig();
  if (!config.agentToken) warnings.push('agentToken não configurado (rode --setup)');
  if (!config.printerName) warnings.push('printerName não configurado (rode --setup)');

  try {
    const printers = await adapter.listPrinters();
    console.log(`adapter=${adapter.name} printers=${printers.length}`);
    if (config.printerName && !printers.includes(config.printerName)) {
      warnings.push(`impressora configurada "${config.printerName}" não encontrada`);
    }
  } catch (err) {
    problems.push(`adapter ${adapter.name}: ${err.message}`);
  }

  for (const w of warnings) console.warn(`⚠️  ${w}`);
  for (const p of problems) console.error(`❌ ${p}`);
  console.log(problems.length === 0 ? '✅ check OK' : '❌ check falhou');
  return problems.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Agent main loop
// ---------------------------------------------------------------------------

async function runAgent() {
  const config = loadConfig();
  const stateDir = ensureStateDir();
  const agentId = config.agentId || `agent-${randomUUID().slice(0, 8)}`;

  if (!config.agentToken) {
    console.error('❌ Agente não pareado.');
    console.error('   Rode: agent.js --setup  (ou configure LABELGO_AGENT_TOKEN)');
    process.exit(1);
  }

  if (!config.printerName) {
    console.error('❌ Impressora não configurada.');
    console.error('   Rode: agent.js --setup  (ou configure LABELGO_PRINTER_NAME)');
    process.exit(1);
  }

  const deps = {
    adapter,
    printerName: config.printerName,
    serverUrl: config.serverUrl,
    agentToken: config.agentToken,
    stateDir,
  };

  console.log(`🚀 LabelGo Agent iniciado (${adapter.name})`);
  console.log(`   Servidor: ${config.serverUrl}`);
  console.log(`   Impressora: ${config.printerName}`);
  console.log(`   Intervalo: ${config.pollInterval}ms`);
  console.log(`   Estado local: ${stateDir}`);
  console.log(`   Agent ID: ${agentId}\n`);

  startHeartbeat(config.serverUrl, config.agentToken, agentId);

  const poll = async () => {
    try {
      // Retry confirmations for labels already sent to the printer — never
      // reprint them.
      const pending = listPendingReceipts(stateDir).length;
      if (pending > 0) {
        console.log(`📨 ${pending} confirmação(ões) pendente(s) de recibo local`);
        await flushPendingConfirmations(deps);
      }

      const jobs = await claimJobs(config.serverUrl, config.agentToken, agentId, 5);
      if (jobs.length > 0) {
        console.log(`📬 ${jobs.length} etiqueta(s) reclamadas da fila`);
      }
      for (const job of jobs) {
        await processJob(job, deps);
      }
    } catch (err) {
      if (err && err.code === 'subscription_required') {
        console.error(`[poll] ${err.message}`);
      } else {
        console.error(`[poll] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  poll();
  setInterval(poll, config.pollInterval);
}

// ---------------------------------------------------------------------------
// Heartbeat — tells the server this agent is online
// ---------------------------------------------------------------------------

async function startHeartbeat(serverUrl, agentToken, agentId) {
  const beat = async () => {
    try {
      await sendHeartbeat(serverUrl, agentToken, agentId);
    } catch (err) {
      console.error(`[heartbeat] ${err.message}`);
    }
  };

  beat();
  setInterval(beat, 30_000);
}
