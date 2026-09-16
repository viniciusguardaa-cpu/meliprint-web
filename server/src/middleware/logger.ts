import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Structured logging + request correlation id.
 * - Assigns req.id (from x-request-id header or generated uuid).
 * - Logs each request as JSON with method, path, status, duration, request_id.
 * - Redacts sensitive values from any logged error bodies.
 */

const SENSITIVE_KEYS = ['authorization', 'access_token', 'refresh_token', 'password', 'secret', 'token', 'cookie'];

function redact(obj: any, depth = 0): any {
  if (obj === null || obj === undefined) return obj;
  if (depth > 5) return '[truncated]';
  if (typeof obj === 'string') {
    // Don't redact short strings that aren't tokens
    if (obj.length > 20 && /token|secret|password/i.test(obj)) return '[redacted]';
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  if (typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return obj;
}

function log(level: string, message: string, meta?: any) {
  const entry: any = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  if (meta) entry.meta = redact(meta);
  // Use stdout for logs, stderr for errors
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  info: (message: string, meta?: any) => log('info', message, meta),
  warn: (message: string, meta?: any) => log('warn', message, meta),
  error: (message: string, meta?: any) => log('error', message, meta),
  debug: (message: string, meta?: any) => {
    if (process.env.LOG_LEVEL === 'debug') log('debug', message, meta);
  },
};

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const id = incoming || crypto.randomUUID();
  (req as any).id = id;
  res.setHeader('x-request-id', id);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('request', {
      request_id: (req as any).id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
    });
  });
  next();
}
