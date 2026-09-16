import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isValidWebhookSignature, computeWebhookSignature } from '../services/webhookSignature.js';

function mockReq(opts: {
  signature?: string;
  requestId?: string;
  dataId?: string;
  body?: any;
  query?: any;
}): any {
  const headers: Record<string, string> = {};
  if (opts.signature) headers['x-signature'] = opts.signature;
  if (opts.requestId) headers['x-request-id'] = opts.requestId;
  return {
    header: (name: string) => headers[name.toLowerCase()],
    query: opts.query || {},
    body: opts.body || {},
  };
}

describe('Mercado Pago webhook signature validation', () => {
  const originalEnv = { ...process.env };
  const SECRET = 'test-webhook-secret';
  const DATA_ID = 'preapproval_123';
  const REQUEST_ID = 'req_abc';
  const TS = '1700000000';

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts a valid signature', () => {
    const sig = computeWebhookSignature(SECRET, DATA_ID, REQUEST_ID, TS);
    const req = mockReq({
      signature: `ts=${TS},v1=${sig}`,
      requestId: REQUEST_ID,
      query: { 'data.id': DATA_ID },
    });
    expect(isValidWebhookSignature(req)).toBe(true);
  });

  it('rejects an invalid signature (wrong secret)', () => {
    const sig = computeWebhookSignature('wrong-secret', DATA_ID, REQUEST_ID, TS);
    const req = mockReq({
      signature: `ts=${TS},v1=${sig}`,
      requestId: REQUEST_ID,
      query: { 'data.id': DATA_ID },
    });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const sig = computeWebhookSignature(SECRET, DATA_ID, REQUEST_ID, TS);
    const tampered = sig.slice(0, -2) + (sig.slice(-2) === 'aa' ? 'bb' : 'aa');
    const req = mockReq({
      signature: `ts=${TS},v1=${tampered}`,
      requestId: REQUEST_ID,
      query: { 'data.id': DATA_ID },
    });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('rejects when signature header is missing', () => {
    const req = mockReq({ requestId: REQUEST_ID, query: { 'data.id': DATA_ID } });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('rejects when request-id header is missing', () => {
    const sig = computeWebhookSignature(SECRET, DATA_ID, REQUEST_ID, TS);
    const req = mockReq({
      signature: `ts=${TS},v1=${sig}`,
      query: { 'data.id': DATA_ID },
    });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('rejects when data.id is missing', () => {
    const sig = computeWebhookSignature(SECRET, DATA_ID, REQUEST_ID, TS);
    const req = mockReq({
      signature: `ts=${TS},v1=${sig}`,
      requestId: REQUEST_ID,
      query: {},
    });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('rejects everything in production when MP_WEBHOOK_SECRET is not configured', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    const req = mockReq({
      signature: `ts=${TS},v1=anything`,
      requestId: REQUEST_ID,
      query: { 'data.id': DATA_ID },
    });
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('allows bypass in development with MP_WEBHOOK_ALLOW_UNSIGNED=1', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';
    process.env.MP_WEBHOOK_ALLOW_UNSIGNED = '1';
    const req = mockReq({});
    expect(isValidWebhookSignature(req)).toBe(true);
  });

  it('rejects in development without MP_WEBHOOK_ALLOW_UNSIGNED', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';
    delete process.env.MP_WEBHOOK_ALLOW_UNSIGNED;
    const req = mockReq({});
    expect(isValidWebhookSignature(req)).toBe(false);
  });

  it('reads data.id from body when not in query', () => {
    const sig = computeWebhookSignature(SECRET, DATA_ID, REQUEST_ID, TS);
    const req = mockReq({
      signature: `ts=${TS},v1=${sig}`,
      requestId: REQUEST_ID,
      body: { data: { id: DATA_ID } },
      query: {},
    });
    expect(isValidWebhookSignature(req)).toBe(true);
  });
});
