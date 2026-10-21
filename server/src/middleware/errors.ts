import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: err.type === 'entity.parse.failed' ? 'invalid_json' : 'bad_request' });
  }
  console.error(`[error] ${req.method} ${req.path}:`, err instanceof Error ? err.message : 'Unknown error');
  res.status(500).json({ error: 'Internal server error' });
}
