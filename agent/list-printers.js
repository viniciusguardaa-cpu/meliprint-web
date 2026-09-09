#!/usr/bin/env node
/**
 * Meliprint Agent — lista as impressoras disponíveis no CUPS.
 *
 * Uso:
 *   node list-printers.js          # lista impressoras do sistema
 *   node list-printers.js raw      # lista também impressoras raw (ZPL)
 *
 * No macOS, as impressoras USB instaladas em System Settings > Printers
 * aparecem automaticamente no CUPS. Para enviar ZPL, use o nome exato
 * que aparece aqui.
 */
import { execSync } from 'child_process';

try {
  const output = execSync('lpstat -p', { encoding: 'utf8' });
  const printers = output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      // "printer Zebra_ZD420 is idle.  enabled since ..."
      const match = line.match(/^printer\s+(\S+)\s+is\s+/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  if (printers.length === 0) {
    console.log('Nenhuma impressora encontrada no CUPS.');
    console.log('No macOS, instale a impressora em System Settings > Printers & Scanners.');
    process.exit(0);
  }

  console.log('Impressoras disponíveis:\n');
  for (const p of printers) {
    console.log(`  ${p}`);
  }
  console.log(`\nTotal: ${printers.length}`);
} catch (error) {
  console.error('Erro ao listar impressoras:', error.message);
  process.exit(1);
}
