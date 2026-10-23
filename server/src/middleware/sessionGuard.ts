import { Request, Response, NextFunction } from 'express';
import { getUserSessionState } from '../db.js';

/** Check on every request: a cached session must not survive account recovery. */
export async function sessionGuard(req: Request, _res: Response, next: NextFunction) {
  if (!req.session?.userId) return next();
  try {
    const state = await getUserSessionState(req.session.userId);
    const revokedAt = state?.sessions_revoked_at
      ? new Date(state.sessions_revoked_at).getTime() : null;
    if (!state || (revokedAt !== null && (req.session.authAt ?? 0) <= revokedAt)) {
      // Also discard pending OAuth attempts established by the revoked session.
      await new Promise<void>((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
      // Public recovery/login routes remain usable; protected routes now see a guest.
      return next();
    }
    next();
  } catch (err) {
    next(err); // Fail closed when the account state cannot be checked.
  }
}
