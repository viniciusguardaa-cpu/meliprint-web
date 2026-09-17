import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  getAuthUrl,
  exchangeCodeForToken,
  getUserInfo,
  refreshAccessToken
} from '../services/mercadolivre.js';
import { findOrCreateUser } from '../db.js';
import { trackEvent } from '../services/analytics.js';

declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    oauthState?: string;
    accessToken?: string;
    refreshToken?: string;
    userId?: number;
    userNickname?: string;
    userEmail?: string;
    tokenExpiresAt?: number;
  }
}

const router = Router();

const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

router.get('/login', (req: Request, res: Response) => {
  try {
    const clientId = getEnvVar('ML_CLIENT_ID');
    const redirectUri = getEnvVar('ML_REDIRECT_URI');

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    req.session.codeVerifier = codeVerifier;
    req.session.oauthState = state;

    const authUrl = getAuthUrl(clientId, redirectUri, codeChallenge, state);
    res.json({ authUrl });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    const codeVerifier = req.session.codeVerifier;
    const expectedState = req.session.oauthState;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    if (!codeVerifier) {
      return res.status(400).json({ error: 'Missing code verifier' });
    }

    // CSRF protection: validate state. If missing or mismatched, reject and
    // regenerate the verifier so a leaked state can't be replayed.
    if (!expectedState || typeof state !== 'string' || state !== expectedState) {
      delete req.session.codeVerifier;
      delete req.session.oauthState;
      return res.status(400).json({ error: 'Invalid or missing OAuth state' });
    }

    const clientId = getEnvVar('ML_CLIENT_ID');
    const clientSecret = getEnvVar('ML_CLIENT_SECRET');
    const redirectUri = getEnvVar('ML_REDIRECT_URI');

    const tokens = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier
    );

    const userInfo = await getUserInfo(tokens.access_token);

    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.userId = userInfo.id;
    req.session.userNickname = userInfo.nickname;
    req.session.userEmail = userInfo.email;
    req.session.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    delete req.session.codeVerifier;
    delete req.session.oauthState;

    // Persist the user at connect time so funnel events (ml_connected) and
    // later billing events have an internal user row to attach to.
    const dbUser = await findOrCreateUser(userInfo.id, userInfo.nickname, userInfo.email);
    await trackEvent({ event_name: 'ml_connected', user_id: dbUser.id });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard`);
  } catch (error) {
    console.error('Callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

router.get('/me', async (req: Request, res: Response) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if token needs refresh
  if (req.session.tokenExpiresAt && Date.now() > req.session.tokenExpiresAt - 60000) {
    try {
      const clientId = getEnvVar('ML_CLIENT_ID');
      const clientSecret = getEnvVar('ML_CLIENT_SECRET');
      
      const tokens = await refreshAccessToken(
        req.session.refreshToken!,
        clientId,
        clientSecret
      );

      req.session.accessToken = tokens.access_token;
      req.session.refreshToken = tokens.refresh_token;
      req.session.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return res.status(401).json({ error: 'Session expired' });
    }
  }

  res.json({
    userId: req.session.userId,
    nickname: req.session.userNickname
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
