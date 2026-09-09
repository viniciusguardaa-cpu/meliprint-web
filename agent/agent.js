#!/usr/bin/env node
/**
 * Meliprint Agent — impressão automática de etiquetas.
 *
 * Este agente roda na máquina onde a impressora térmica Zebra está
 * conectada via USB. Ele fica em polling no servidor do Meliprint
 * procurando etiquetas ZPL prontas para imprimir e envia direto
 * para a impressora via CUPS (comando `lp -o raw`).
 *
 * Requisitos:
 *   - Node.js 18+
 *   - Impressora instalada no macOS (System Settings > Printers)
 *   - A impressora Zebra deve estar configurada para aceitar ZPL raw
 *
 * Configuração via variáveis de ambiente ou arquivo .env:
 *   MELIPRINT_SERVER_URL=http://localhost:3001
 *   MELIPRINT_AGENT_TOKEN=<token gerado no painel do Meliprint>
 *   MELIPRINT_PRINTER_NAME=Zebra_ZD420
 *   MELIPRINT_POLL_INTERVAL=5000
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

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

const SERVER_URL = (process.env.MELIPRINT_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
const AGENT_TOKEN = process.env.MELIPRINT_AGENT_TOKEN;
const PRINTER_NAME = process.env.MELIPRINT_PRINTER_NAME;
const POLL_INTERVAL = Number(process.env.MELIPRINT_POLL_INTERVAL || 5000);

if (!AGENT_TOKEN) {
  console.error('❌ MELIPRINT_AGENT_TOKEN não configurado.');
  console.error('   Gere o token no painel do Meliprint (Dashboard > Impressão Automática).');
  process.exit(1);
}

if (!PRINTER_NAME) {
  console.error('❌ MELIPRINT_PRINTER_NAME não configurado.');
  console.error('   Descubra o nome com: node list-printers.js');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Print ZPL to the thermal printer via CUPS
// ---------------------------------------------------------------------------

function printZpl(zpl) {
  // `lp -d <printer> -o raw` sends raw bytes to the printer without CUPS filters.
  // This is essential for ZPL — CUPS would otherwise try to render it as text/PDF.
  const child = execFileSync('lp', [
    '-d', PRINTER_NAME,
    '-o', 'raw',
    '-o', 'media=4x6',
    '-'
  ], {
    input: zpl,
    encoding: 'utf8',
    timeout: 30000
  });

  return child.trim();
}

// ---------------------------------------------------------------------------
// Server communication
// ---------------------------------------------------------------------------

async function fetchPendingJobs() {
  const resp = await fetch(`${SERVER_URL}/api/auto-print/queue`, {
    headers: { 'Authorization': `Bearer ${AGENT_TOKEN}` }
  });

  if (resp.status === 401) {
    throw new Error('Token do agente inválido. Gere um novo token no painel do Meliprint.');
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
// Main loop
// ---------------------------------------------------------------------------

async function processJob(job) {
  console.log(`🖨️  Imprimindo etiqueta do shipment ${job.shipment_id} (job #${job.id})...`);

  try {
    const result = printZpl(job.zpl);
    console.log(`   ✅ ${result}`);
    await markPrinted(job.id);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Erro ao imprimir: ${msg}`);
    await markFailed(job.id, msg);
  }
}

async function poll() {
  try {
    const jobs = await fetchPendingJobs();
    if (jobs.length > 0) {
      console.log(`📬 ${jobs.length} etiqueta(s) na fila`);
    }
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[poll] ${msg}`);
  }
}

console.log(`🚀 Meliprint Agent iniciado`);
console.log(`   Servidor: ${SERVER_URL}`);
console.log(`   Impressora: ${PRINTER_NAME}`);
console.log(`   Intervalo: ${POLL_INTERVAL}ms\n`);

// Run immediately, then on interval
poll();
setInterval(poll, POLL_INTERVAL);
