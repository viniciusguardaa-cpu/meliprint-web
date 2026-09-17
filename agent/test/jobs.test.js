/**
 * Agent reliability tests — node:test, no real printer or server.
 *
 * Covers the P0 printing requirements:
 *  - network loss AFTER spooler submission → no reprint, only retry confirmation
 *  - agent restart → pending receipts flushed, label not reprinted
 *  - uncertain outcome → never auto-reprinted
 *  - print failure (printer rejected) → reported as failed
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { processJob, flushPendingConfirmations } from '../lib/jobs.js';
import { getReceipt, listPendingReceipts } from '../lib/store.js';

function tmpState() {
  return mkdtempSync(join(tmpdir(), 'labelgo-agent-test-'));
}

/** Mock adapter recording every printZpl call. */
function mockAdapter(behavior = {}) {
  const calls = [];
  return {
    name: 'mock',
    calls,
    async printZpl(printer, zpl) {
      calls.push({ printer, zpl });
      if (behavior.throw) throw new Error(behavior.throw);
      return behavior.result || 'spooler_accepted';
    },
    async listPrinters() { return ['MockPrinter']; },
  };
}

/** Install a mock fetch. handlers: { 'POST /path': resp | (body) => resp | throws } */
function mockFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const key = `POST ${new URL(url).pathname}`;
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    const handler = handlers[key];
    if (!handler) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    if (typeof handler === 'function') return handler(opts.body ? JSON.parse(opts.body) : {});
    return handler;
  };
  return calls;
}

const ok = () => ({ ok: true, status: 200, json: async () => ({ ok: true }), text: async () => 'ok' });
const fail = (status = 500) => ({ ok: false, status, json: async () => ({}), text: async () => `err ${status}` });
const networkDown = () => { throw new Error('fetch failed: network down'); };

const deps = (stateDir, adapter) => ({
  adapter,
  printerName: 'MockPrinter',
  serverUrl: 'http://localhost:3001',
  agentToken: 'test-token',
  stateDir,
  log: () => {},
  error: () => {},
});

describe('print job processing', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });

  it('prints once, then confirms — happy path', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();
    mockFetch({ 'POST /api/auto-print/queue/1/printed': ok() });

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    assert.equal(adapter.calls.length, 1);
    assert.equal(r.status, 'confirmed');
    assert.equal(getReceipt(1, stateDir).confirmed, true);
  });

  it('network drop AFTER spooler accept → receipt stays pending, no reprint', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();
    const calls = mockFetch({ 'POST /api/auto-print/queue/1/printed': networkDown });

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    assert.equal(adapter.calls.length, 1); // printed once
    assert.equal(r.status, 'confirmation_pending');
    const receipt = getReceipt(1, stateDir);
    assert.equal(receipt.confirmed, false);
    assert.equal(receipt.sentToPrinterAt !== undefined, true);
    assert.equal(calls.length, 1);
  });

  it('restart + retry: pending receipt retries confirmation WITHOUT reprinting', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();

    // 1st pass: print OK, confirm fails (network down)
    mockFetch({ 'POST /api/auto-print/queue/1/printed': networkDown });
    await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));
    assert.equal(adapter.calls.length, 1);

    // Restart (new processJob call on same stateDir) — server now reachable
    mockFetch({ 'POST /api/auto-print/queue/1/printed': ok() });
    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    assert.equal(adapter.calls.length, 1, 'label must NOT be reprinted');
    assert.equal(r.status, 'confirmed');
    assert.equal(getReceipt(1, stateDir).confirmed, true);
  });

  it('flushPendingConfirmations retries only confirmations after restart', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();

    mockFetch({ 'POST /api/auto-print/queue/1/printed': networkDown });
    await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));
    mockFetch({ 'POST /api/auto-print/queue/2/printed': networkDown });
    await processJob({ id: 2, shipment_id: 101, zpl: '^XA^XZ' }, deps(stateDir, adapter));
    assert.equal(adapter.calls.length, 2);
    assert.equal(listPendingReceipts(stateDir).length, 2);

    // Network restored — flush retries both confirmations
    mockFetch({
      'POST /api/auto-print/queue/1/printed': ok(),
      'POST /api/auto-print/queue/2/printed': ok(),
    });
    const flushed = await flushPendingConfirmations(deps(stateDir, adapter));

    assert.equal(flushed, 2);
    assert.equal(adapter.calls.length, 2, 'no reprints during flush');
    assert.equal(listPendingReceipts(stateDir).length, 0);
  });

  it('server 404 on confirm → receipt dropped (orphaned), no reprint', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();
    mockFetch({ 'POST /api/auto-print/queue/1/printed': fail(404) });

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    assert.equal(r.status, 'orphaned');
    assert.equal(adapter.calls.length, 1);
  });

  it('printer rejects the job → reported failed, no receipt', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter({ throw: 'printer offline' });
    const calls = mockFetch({ 'POST /api/auto-print/queue/1/failed': ok() });

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    assert.equal(r.status, 'failed');
    assert.equal(getReceipt(1, stateDir), null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.includes('/failed'), true);
  });

  it('already-confirmed job is skipped entirely', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter();
    mockFetch({ 'POST /api/auto-print/queue/1/printed': ok() });
    await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));
    assert.equal(r.status, 'already_confirmed');
    assert.equal(adapter.calls.length, 1);
  });

  it('cannot report failure (server down + printer down) → failed, server reconciles via needs_review', async () => {
    const stateDir = tmpState();
    const adapter = mockAdapter({ throw: 'usb disconnected' });
    mockFetch({ 'POST /api/auto-print/queue/1/failed': networkDown });

    const r = await processJob({ id: 1, shipment_id: 100, zpl: '^XA^XZ' }, deps(stateDir, adapter));

    // Printer threw → nothing was sent, so no receipt; the server-side claim
    // will go stale and move the job to needs_review for a human.
    assert.equal(r.status, 'failed');
    assert.equal(getReceipt(1, stateDir), null);
  });
});
