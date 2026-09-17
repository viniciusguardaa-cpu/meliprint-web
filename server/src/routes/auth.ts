import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge
} from '../services/mercadolivre.js';
import { getProvider, listProviders } from '../providers/index.js';
import {
  createUser,
  getUserById,
  getUserByEmail,
  setUserPassword,
  markEmailVerified,
  setUserMlId,
  upsertMarketplaceAccount,
  getMarketplaceAccountByExternal,
  getMarketplaceAccountsForUser,
  deleteMarketplaceAccount,
  countMarketplaceAccounts,
  createAuthToken,
  consumeAuthToken,
  upsertAutoPrintConfig
} from '../db.js';
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from '../services/password.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';
import { trackEvent } from '../services/analytics.js';

declare module 'express-session' {
  interface SessionData {
    /** Internal users.id — provider-agnostic identity. */
    userId?: number;
    /** In-flight OAuth attempt (state + PKCE verifier + intent). */
    oauth?: {
      provider: string;
      verifier: string;
      state: string;
      mode: 'login' | 'connect';
      /** Frontend path to redirect back to after a connect flow. */
      returnTo?: string;
    };
  }
}

const router = Router();

function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Rotate the session id after a privilege change (login/connect). */
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

/**
 * OAuth redirect URI per provider. Mercado Livre keeps using the configured
 * ML_REDIRECT_URI (backwards compatible with the registered app); other
 * providers derive from the same base: {origin}/api/auth/oauth/{id}/callback.
 */
function getOAuthRedirectUri(providerId: string): string {
  const mlUri = process.env.ML_REDIRECT_URI;
  if (providerId === 'mercadolivre' && mlUri) return mlUri;
  const base = mlUri ? new URL(mlUri).origin : (process.env.API_BASE_URL || 'http://localhost:3001');
  return `${base}/api/auth/oauth/${providerId}/callback`;
}

async function createSessionForUser(req: Request, userId: number) {
  await regenerateSession(req);
  req.session.userId = userId;
}

// ---------------------------------------------------------------------------
// Email + password auth
// ---------------------------------------------------------------------------

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const email = (req.body?.email as string | undefined)?.trim().toLowerCase();
  const password = req.body?.password as string | undefined;
  const nickname = (req.body?.nickname as string | undefined)?.trim()
    || (email ? email.split('@')[0] : '');

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'E-mail inválido' });
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({
      error: 'weak_password',
      message: `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`
    });
  }

  try {
    if (await getUserByEmail(email)) {
      return res.status(409).json({ error: 'email_in_use', message: 'Este e-mail já possui uma conta' });
    }

    const user = await createUser({
      email,
      nickname: nickname || email.split('@')[0],
      passwordHash: hashPassword(password),
      emailVerified: false
    });

    await createSessionForUser(req, user.id);
    await trackEvent({ event_name: 'user_registered', user_id: user.id, properties: { method: 'password' } });

    // Verification email is best-effort — never block signup on mail delivery.
    try {
      const tokenRow = await createAuthToken(user.id, 'verify_email', 24 * 60);
      await sendVerificationEmail(email, `${frontendUrl()}/verificar-email?token=${tokenRow.token}`);
    } catch (mailErr) {
      console.error('[auth] Verification email failed:', mailErr);
    }

    res.json({ ok: true, user: { userId: user.id, email: user.email, nickname: user.nickname } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const email = (req.body?.email as string | undefined)?.trim().toLowerCase();
  const password = req.body?.password as string | undefined;

  if (!email || !password) {
    return res.status(400).json({ error: 'missing_credentials', message: 'Informe e-mail e senha' });
  }

  try {
    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'E-mail ou senha incorretos' });
    }

    await createSessionForUser(req, user.id);
    res.json({ ok: true, user: { userId: user.id, email: user.email, nickname: user.nickname } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  const email = (req.body?.email as string | undefined)?.trim().toLowerCase();

  // Always 200 — never reveal whether the email exists.
  res.json({ ok: true });

  if (!email) return;
  try {
    const user = await getUserByEmail(email);
    if (!user) return;
    const tokenRow = await createAuthToken(user.id, 'reset_password', 30);
    await sendPasswordResetEmail(email, `${frontendUrl()}/redefinir-senha?token=${tokenRow.token}`);
  } catch (error) {
    console.error('[auth] forgot-password failed:', error);
  }
});

/** Resend the verification email (requires session). */
router.post('/verify-email/send', authLimiter, async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await getUserById(req.session.userId);
    if (!user?.email) {
      return res.status(400).json({ error: 'no_email' });
    }
    if (user.email_verified) {
      return res.json({ ok: true, alreadyVerified: true });
    }
    const tokenRow = await createAuthToken(user.id, 'verify_email', 24 * 60);
    await sendVerificationEmail(user.email, `${frontendUrl()}/verificar-email?token=${tokenRow.token}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[auth] verify-email/send failed:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

/** Confirm an email verification token (called from the /verificar-email page). */
router.post('/verify-email', authLimiter, async (req: Request, res: Response) => {
  const token = req.body?.token as string | undefined;
  if (!token) {
    return res.status(400).json({ error: 'invalid_token' });
  }
  try {
    const userId = await consumeAuthToken(token, 'verify_email');
    if (!userId) {
      return res.status(400).json({ error: 'invalid_token', message: 'Link expirado ou já utilizado' });
    }
    await markEmailVerified(userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('[auth] verify-email failed:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  const token = req.body?.token as string | undefined;
  const password = req.body?.password as string | undefined;

  if (!token || !password || password.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({
      error: 'invalid_request',
      message: `Token inválido ou senha menor que ${PASSWORD_MIN_LENGTH} caracteres`
    });
  }

  try {
    // Also proves mailbox ownership → marks email verified + sets password.
    // Works for OAuth-created accounts adding their first password too.
    const userId = await consumeAuthToken(token, 'reset_password');
    if (!userId) {
      return res.status(400).json({ error: 'invalid_token', message: 'Link expirado ou já utilizado' });
    }
    await setUserPassword(userId, hashPassword(password));
    await createSessionForUser(req, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ---------------------------------------------------------------------------
// OAuth providers (login + connect)
// ---------------------------------------------------------------------------

/** Available providers for the connect-accounts UI. */
router.get('/providers', (_req: Request, res: Response) => {
  res.json({ providers: listProviders().map((p) => ({ id: p.id, displayName: p.displayName })) });
});

/**
 * Start an OAuth flow. When logged in it is a "connect account" flow;
 * otherwise it is a "login with provider" flow.
 */
function handleOAuthStart(req: Request, res: Response, providerId: string) {
  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(404).json({ error: 'unknown_provider' });
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Optional post-connect redirect target — must be a relative frontend
    // path ("/configuracoes"), never an absolute URL (open redirect guard).
    const returnTo = typeof req.query.return_to === 'string'
      && /^\/(?!\/)/.test(req.query.return_to)
      ? req.query.return_to
      : undefined;

    req.session.oauth = {
      provider: provider.id,
      verifier: codeVerifier,
      state,
      mode: req.session.userId ? 'connect' : 'login',
      returnTo
    };

    const redirectUri = getOAuthRedirectUri(provider.id);
    res.json({ authUrl: provider.getAuthUrl(redirectUri, state, codeChallenge) });
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}

router.get('/oauth/:provider/start', (req: Request, res: Response) => {
  handleOAuthStart(req, res, req.params.provider);
});

/** Legacy alias kept for the existing frontend: starts the ML OAuth flow. */
router.get('/login', (req: Request, res: Response) => {
  handleOAuthStart(req, res, 'mercadolivre');
});

/** Shared OAuth callback logic for /callback (legacy ML) and /oauth/:provider/callback. */
async function handleOAuthCallback(req: Request, res: Response, providerId: string) {
  const { code, state } = req.query;
  const pending = req.session.oauth;

  try {
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // CSRF: state must match the attempt stored at /start, for the same provider.
    if (!pending || pending.provider !== providerId || typeof state !== 'string' || state !== pending.state) {
      delete req.session.oauth;
      return res.status(400).json({ error: 'Invalid or missing OAuth state' });
    }
    delete req.session.oauth;

    const provider = getProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'unknown_provider' });
    }

    const redirectUri = getOAuthRedirectUri(providerId);
    const { identity, tokens } = await provider.exchangeCode(code, redirectUri, pending.verifier);

    const existing = await getMarketplaceAccountByExternal(providerId, identity.externalUserId);

    if (pending.mode === 'connect' && req.session.userId) {
      // Connect flow: attach to the logged-in user — never to someone else.
      const returnTo = pending.returnTo || '/dashboard';
      if (existing && existing.user_id !== req.session.userId) {
        return res.redirect(`${frontendUrl()}${returnTo}?error=account_in_use`);
      }
      await upsertMarketplaceAccount(req.session.userId, providerId, identity.externalUserId, {
        nickname: identity.nickname,
        email: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt
      });
      if (providerId === 'mercadolivre') {
        await setUserMlId(req.session.userId, identity.externalUserId).catch(() => {});
      }
      await trackEvent({
        event_name: 'account_connected',
        user_id: req.session.userId,
        properties: { provider: providerId }
      });
      return res.redirect(`${frontendUrl()}${returnTo}?connected=${providerId}`);
    }

    // Login flow: resolve to an internal user — existing account owner,
    // same-email user, or a brand-new account.
    let userId: number;
    if (existing) {
      userId = existing.user_id;
      await upsertMarketplaceAccount(userId, providerId, identity.externalUserId, {
        nickname: identity.nickname,
        email: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt
      });
    } else {
      // Email linking: Mercado Livre verifies account emails, so matching on
      // it is safe. Re-evaluate per provider before trusting theirs.
      const byEmail = identity.email ? await getUserByEmail(identity.email) : null;
      if (byEmail) {
        userId = byEmail.id;
      } else {
        const nickname = identity.nickname
          || (identity.email ? identity.email.split('@')[0] : `vendedor_${identity.externalUserId}`);
        const user = await createUser({
          email: identity.email || `${providerId}_${identity.externalUserId}@noemail.labelgo`,
          nickname,
          emailVerified: !!identity.email
        });
        userId = user.id;
      }
      await upsertMarketplaceAccount(userId, providerId, identity.externalUserId, {
        nickname: identity.nickname,
        email: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt
      });
      if (providerId === 'mercadolivre') {
        await setUserMlId(userId, identity.externalUserId).catch(() => {});
        await trackEvent({ event_name: 'ml_connected', user_id: userId });
      }
      await trackEvent({ event_name: 'account_connected', user_id: userId, properties: { provider: providerId } });
    }

    await createSessionForUser(req, userId);
    res.redirect(`${frontendUrl()}/dashboard`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${frontendUrl()}/login?error=auth_failed`);
  }
}

router.get('/oauth/:provider/callback', async (req: Request, res: Response) => {
  await handleOAuthCallback(req, res, req.params.provider);
});

/** Legacy ML callback — the registered ML_REDIRECT_URI points here. */
router.get('/callback', async (req: Request, res: Response) => {
  await handleOAuthCallback(req, res, 'mercadolivre');
});

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

router.get('/accounts', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const accounts = await getMarketplaceAccountsForUser(req.session.userId);
  res.json({
    accounts: accounts.map((a: any) => ({
      id: a.id,
      provider: a.provider,
      externalUserId: a.external_user_id,
      nickname: a.nickname,
      email: a.email,
      createdAt: a.created_at
    }))
  });
});

router.delete('/accounts/:id', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const accountId = Number(req.params.id);
  if (!Number.isFinite(accountId)) {
    return res.status(400).json({ error: 'Invalid account id' });
  }

  try {
    const user = await getUserById(req.session.userId);
    const accountCount = await countMarketplaceAccounts(req.session.userId);

    // Guard: removing the only auth method would lock the user out.
    if (!user?.password_hash && accountCount <= 1) {
      return res.status(400).json({
        error: 'cannot_remove_last_login',
        message: 'Defina uma senha antes de desconectar sua única forma de acesso.'
      });
    }

    const removed = await deleteMarketplaceAccount(accountId, req.session.userId);
    if (!removed) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Auto-print can't work without the marketplace account — disable it.
    if (removed.provider === 'mercadolivre') {
      await upsertAutoPrintConfig(req.session.userId, { enabled: false }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

router.get('/me', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await getUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accounts = await getMarketplaceAccountsForUser(user.id);
  res.json({
    userId: user.id,
    nickname: user.nickname,
    email: user.email,
    emailVerified: user.email_verified === true,
    accounts: accounts.map((a: any) => ({
      id: a.id,
      provider: a.provider,
      externalUserId: a.external_user_id,
      nickname: a.nickname
    }))
  });
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

export default router;
