/**
 * Local print receipts — durable proof that a job was sent to the printer.
 *
 * A receipt is written AFTER the printer accepts the job and BEFORE the server
 * confirmation. If the confirmation HTTP call fails (network drop, restart),
 * the receipt stays pending and the agent retries ONLY the confirmation —
 * the label is never printed twice for the same job.
 */
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { ensureStateDir, getStateDir } from './paths.js';

function receiptsDir(stateDir = getStateDir()) {
  const dir = join(stateDir, 'receipts');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function zplHash(zpl) {
  return createHash('sha256').update(String(zpl)).digest('hex').slice(0, 16);
}

/**
 * Persist a receipt for a job that was accepted by the printer.
 * Atomic write (tmp + rename) so a crash mid-write never leaves a torn file.
 */
export function saveReceipt(receipt, stateDir = getStateDir()) {
  ensureDir(stateDir);
  const file = join(receiptsDir(stateDir), `job-${receipt.jobId}.json`);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2));
  renameSync(tmp, file);
  return file;
}

function ensureDir(stateDir) {
  mkdirSync(stateDir, { recursive: true });
}

export function getReceipt(jobId, stateDir = getStateDir()) {
  const file = join(receiptsDir(stateDir), `job-${jobId}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Receipts whose server confirmation is still pending. */
export function listPendingReceipts(stateDir = getStateDir()) {
  const dir = receiptsDir(stateDir);
  const pending = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const receipt = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (!receipt.confirmed) pending.push(receipt);
    } catch {
      // torn/unknown file — ignore
    }
  }
  return pending;
}

export function markReceiptConfirmed(jobId, stateDir = getStateDir()) {
  const receipt = getReceipt(jobId, stateDir);
  if (!receipt) return null;
  receipt.confirmed = true;
  receipt.confirmedAt = new Date().toISOString();
  saveReceipt(receipt, stateDir);
  return receipt;
}
