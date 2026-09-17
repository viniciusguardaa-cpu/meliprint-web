/**
 * Job processing — keeps "sent to printer" and "confirmed to server" as
 * separate durable steps via local receipts.
 *
 * Rules:
 *  - A job is printed at most once: if a receipt exists, we only retry the
 *    server confirmation, never the print.
 *  - A failed confirmation is NOT a print failure — the receipt stays pending
 *    and is flushed on the next poll/restart.
 *  - Uncertain outcomes are surfaced as pending review server-side; the agent
 *    never reprints on its own.
 */
import { saveReceipt, getReceipt, listPendingReceipts, markReceiptConfirmed, zplHash } from './store.js';
import { confirmPrinted, markFailed } from './api.js';

const noop = () => {};

export async function processJob(job, deps) {
  const { adapter, printerName, serverUrl, agentToken, stateDir, log = console.log, error = console.error } = deps;

  // Receipt already exists → the printer already got this job. Only retry
  // the server confirmation.
  const existing = getReceipt(job.id, stateDir);
  if (existing) {
    if (existing.confirmed) {
      log(`   ⏭️  Job #${job.id} já confirmado — ignorando`);
      return { status: 'already_confirmed' };
    }
    log(`   🔁 Job #${job.id} já enviado à impressora — retentando confirmação`);
    return confirmJob(job, existing, deps);
  }

  try {
    const result = await adapter.printZpl(printerName, job.zpl);
    const receipt = {
      jobId: job.id,
      shipmentId: job.shipment_id,
      printer: printerName,
      zplHash: zplHash(job.zpl),
      sentToPrinterAt: new Date().toISOString(),
      confirmed: false,
      result: String(result || 'spooler_accepted'),
    };
    saveReceipt(receipt, stateDir);
    log(`   ✅ Enviado à impressora (spooler aceitou) — confirmando ao servidor...`);
    return confirmJob(job, receipt, deps);
  } catch (err) {
    // printZpl threw BEFORE we wrote a receipt → the print itself failed.
    const msg = err instanceof Error ? err.message : String(err);
    error(`   ❌ Erro ao imprimir: ${msg}`);
    try {
      await markFailed(serverUrl, agentToken, job.id, msg);
    } catch (confirmErr) {
      // Could not even report the failure — the server will move this job to
      // needs_review when the claim goes stale, so a human can check.
      error(`   ⚠️  Não foi possível reportar a falha ao servidor: ${confirmErr.message}`);
    }
    return { status: 'failed', error: msg };
  }
}

async function confirmJob(job, receipt, deps) {
  const { serverUrl, agentToken, stateDir, log = console.log, error = console.error } = deps;
  try {
    await confirmPrinted(serverUrl, agentToken, job.id, receipt.sentToPrinterAt);
    markReceiptConfirmed(job.id, stateDir);
    log(`   ✔️  Confirmado ao servidor (job #${job.id})`);
    return { status: 'confirmed' };
  } catch (err) {
    if (err.status === 404) {
      // Job no longer exists/owned — drop the receipt, nothing to confirm.
      markReceiptConfirmed(job.id, stateDir);
      error(`   ⚠️  Servidor não reconhece o job #${job.id} (404) — recibo descartado`);
      return { status: 'orphaned' };
    }
    error(`   ⚠️  Confirmação falhou (${err.message}) — será retentada; etiqueta NÃO será reimpressa`);
    return { status: 'confirmation_pending', error: err.message };
  }
}

/** Retry server confirmation for every unconfirmed receipt. */
export async function flushPendingConfirmations(deps) {
  const { stateDir, log = console.log } = deps;
  const pending = listPendingReceipts(stateDir);
  for (const receipt of pending) {
    log(`🔄 Retentando confirmação do job #${receipt.jobId} (impresso em ${receipt.sentToPrinterAt})`);
    await confirmJob({ id: receipt.jobId, shipment_id: receipt.shipmentId }, receipt, deps);
  }
  return pending.length;
}
