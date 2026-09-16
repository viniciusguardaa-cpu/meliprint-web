#!/usr/bin/env node
/**
 * Printly Agent — lista as impressoras disponíveis (cross-platform).
 *
 * Uso:
 *   node list-printers.js
 */
import { getPrinterAdapter } from './printers/index.js';

const adapter = getPrinterAdapter();

try {
  const printers = await adapter.listPrinters();

  if (printers.length === 0) {
    console.log(`Nenhuma impressora encontrada (${adapter.name}).`);
    if (adapter.name === 'CUPS') {
      console.log('No macOS, instale a impressora em System Settings > Printers & Scanners.');
    } else if (adapter.name === 'Windows') {
      console.log('No Windows, instale a impressora em Configurações > Dispositivos > Impressoras.');
    }
    process.exit(0);
  }

  console.log(`Impressoras disponíveis (${adapter.name}):\n`);
  for (const p of printers) {
    console.log(`  ${p}`);
  }
  console.log(`\nTotal: ${printers.length}`);
} catch (error) {
  console.error('Erro ao listar impressoras:', error.message);
  process.exit(1);
}
