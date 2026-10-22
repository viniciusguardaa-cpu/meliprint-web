import { Router, Request, Response } from 'express';
import { validBrowserOrigin } from '../middleware/adminAuth.js';
import { requirePartner } from '../middleware/partnerAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { findPartnerByAccessKey, findPartnerByCredentials, changePartnerPassword, getPartnerDashboard, validPassword } from '../services/partners.js';

const router = Router();

// Login accepts either username + password (default) or the access key
// (recovery path). Same session either way.
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  if (!validBrowserOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  try {
    const body = req.body || {};
    const accessKey = String(body.access_key ?? '').trim();
    let partner: { id: number } | null = null;
    if (accessKey) {
      partner = await findPartnerByAccessKey(accessKey);
      if (!partner) return res.status(401).json({ error: 'Chave de acesso inválida' });
    } else {
      partner = await findPartnerByCredentials(String(body.username ?? ''), String(body.password ?? ''));
      if (!partner) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Erro ao iniciar sessão' });
      (req.session as any).partnerId = partner.id;
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ error: 'Erro ao salvar sessão' });
        res.json({ ok: true });
      });
    });
  } catch (error) {
    console.error('Partner login error:', error);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  if (!validBrowserOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao sair' });
    res.clearCookie('labelgo.partner.sid', { path: '/api/partner', secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    res.json({ ok: true });
  });
});

// The partner changes its own password; the current password is required.
router.post('/password', requirePartner, authLimiter, async (req: Request, res: Response) => {
  if (!validBrowserOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  try {
    const next = req.body?.new_password;
    if (!validPassword(next)) return res.status(400).json({ error: 'A nova senha precisa de pelo menos 8 caracteres' });
    const result = await changePartnerPassword((req.session as any).partnerId, String(req.body?.current_password ?? ''), next);
    if (!result.ok) return res.status(401).json({ error: result.error });
    res.json({ ok: true });
  } catch (error) {
    console.error('Partner password change error:', error);
    res.status(500).json({ error: 'Erro ao trocar a senha' });
  }
});

router.use(requirePartner);

// The partner id comes only from the server-side session, never from the request.
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const data = await getPartnerDashboard((req.session as any).partnerId);
    if (!data || !data.partner.is_active) return res.status(401).json({ error: 'Unauthorized' });
    res.json(data);
  } catch (error) {
    console.error('Partner dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
