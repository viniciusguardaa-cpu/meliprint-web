import { Router, Request, Response } from 'express';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  getAuthUrl,
  exchangeCodeForToken,
  getUserInfo,
  refreshAccessToken
} from '../services/mercadolivre.js';

declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    accessToken?: string;
    refreshToken?: string;
    userId?: number;
    userNickname?: string;
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

router.get('/login', (req: Request, res: Response) => {
  try {
    const clientId = getEnvVar('ML_CLIENT_ID');
    const redirectUri = getEnvVar('ML_REDIRECT_URI');

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.codeVerifier = codeVerifier;

    const authUrl = getAuthUrl(clientId, redirectUri, codeChallenge);
    res.json({ authUrl });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    const codeVerifier = req.session.codeVerifier;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    if (!codeVerifier) {
      return res.status(400).json({ error: 'Missing code verifier' });
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
    req.session.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    delete req.session.codeVerifier;

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
