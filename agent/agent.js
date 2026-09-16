#!/usr/bin/env node
/**
 * Printly Agent — impressão automática de etiquetas do Mercado Livre.
 *
 * Cross-platform: macOS (CUPS), Linux (CUPS), Windows (RawPrinterHelper).
 *
 * Uso:
 *   node agent.js                          # modo normal (requer .env configurado)
 *   node agent.js --pair                   # modo pareamento (gera código de pareamento)
 *   node agent.js --list-printers          # lista impressoras disponíveis
 *   node agent.js --test-print <printer>   # imprime etiqueta de teste
 *
 * Configuração via .env ou variáveis de ambiente:
 *   PRINTLY_SERVER_URL=http://localhost:3001
 *   PRINTLY_AGENT_TOKEN=<token do painel>
 *   PRINTLY_PRINTER_NAME=<nome da impressora>
 *   PRINTLY_POLL_INTERVAL=5000
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getPrinterAdapter } from './printers/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile() {
  try {
    const content = readFileSync(new URL('./.env', import.meta.url), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not found — use environment variables
  }
}

loadEnvFile();

const SERVER_URL = (process.env.PRINTLY_SERVER_URL || process.env.MELIPRINT_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
const AGENT_TOKEN = process.env.PRINTLY_AGENT_TOKEN || process.env.MELIPRINT_AGENT_TOKEN;
const PRINTER_NAME = process.env.PRINTLY_PRINTER_NAME || process.env.MELIPRINT_PRINTER_NAME;
const POLL_INTERVAL = Number(process.env.PRINTLY_POLL_INTERVAL || process.env.MELIPRINT_POLL_INTERVAL || 5000);
const AGENT_ID = `agent-${require('crypto').randomUUID().slice(0, 8)}`;

const adapter = getPrinterAdapter();

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
  const printer = args[printerIdx + 1] || PRINTER_NAME;
  if (!printer) {
    console.error('❌ Especifique a impressora: node agent.js --test-print <printer>');
    process.exit(1);
  }
  const testZpl = '^XA^FO50,50^A0N,50,50^FDPrintly Test^FS^FO50,120^A0N,30,30^FDLabel OK^FS^XZ';
  console.log(`🖨️  Imprimindo etiqueta de teste em ${printer}...`);
  adapter.printZpl(printer, testZpl).then(() => {
    console.log('   ✅ Etiqueta de teste enviada!');
    process.exit(0);
  }).catch(err => {
    console.error('   ❌ Erro:', err.message);
    process.exit(1);
  });
} else {
  // Normal mode — run the agent
  runAgent();
}

// ---------------------------------------------------------------------------
// Agent main loop
// ---------------------------------------------------------------------------

async function runAgent() {
  if (!AGENT_TOKEN) {
    console.error('❌ PRINTLY_AGENT_TOKEN não configurado.');
    console.error('   Gere o token no painel do Printly (Dashboard > Impressão Automática).');
    process.exit(1);
  }

  if (!PRINTER_NAME) {
    console.error('❌ PRINTLY_PRINTER_NAME não configurado.');
    console.error('   Descubra o nome com: node agent.js --list-printers');
    process.exit(1);
  }

  console.log(`🚀 Printly Agent iniciado (${adapter.name})`);
  console.log(`   Servidor: ${SERVER_URL}`);
  console.log(`   Impressora: ${PRINTER_NAME}`);
  console.log(`   Intervalo: ${POLL_INTERVAL}ms`);
  console.log(`   Agent ID: ${AGENT_ID}\n`);

  // Start heartbeat
  startHeartbeat();

  // Run immediately, then on interval
  poll();
  setInterval(poll, POLL_INTERVAL);
}

// ---------------------------------------------------------------------------
// Heartbeat — tells the server this agent is online
// ---------------------------------------------------------------------------

async function startHeartbeat() {
  const sendHeartbeat = async () => {
    try {
      await fetch(`${SERVER_URL}/api/auto-print/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID }),
      });
    } catch (err) {
      console.error(`[heartbeat] ${err.message}`);
    }
  };

  sendHeartbeat();
  setInterval(sendHeartbeat, 30_000); // every 30s
}

// ---------------------------------------------------------------------------
// Server communication
// ---------------------------------------------------------------------------

async function claimJobs() {
  const resp = await fetch(`${SERVER_URL}/api/auto-print/queue/claim`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: AGENT_ID, limit: 5 }),
  });

  if (resp.status === 401) {
    throw new Error('Token do agente inválido. Gere um novo token no painel do Printly.');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.jobs || [];
}

async function markPrinted(jobId) {
  await fetch(`${SERVER_URL}/api/auto-print/queue/${jobId}/printed`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
}

async function markFailed(jobId, error) {
  await fetch(`${SERVER_URL}/api/auto-print/queue/${jobId}/failed`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: error.slice(0, 500) })
  });
}

// ---------------------------------------------------------------------------
// Job processing
// ---------------------------------------------------------------------------

async function processJob(job) {
  console.log(`🖨️  Imprimindo etiqueta do shipment ${job.shipment_id} (job #${job.id})...`);

  try {
    const result = await adapter.printZpl(PRINTER_NAME, job.zpl);
    console.log(`   ✅ ${result || 'OK'}`);
    await markPrinted(job.id);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Erro ao imprimir: ${msg}`);
    await markFailed(job.id, msg);
  }
}

async function poll() {
  try {
    const jobs = await claimJobs();
    if (jobs.length > 0) {
      console.log(`📬 ${jobs.length} etiqueta(s) reclamadas da fila`);
    }
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[poll] ${msg}`);
  }
}
