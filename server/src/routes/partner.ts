import { Router, Request, Response } from 'express';
import { validBrowserOrigin } from '../middleware/adminAuth.js';
import { requirePartner } from '../middleware/partnerAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { findPartnerByAccessKey, getPartnerDashboard } from '../services/partners.js';

const router = Router();

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  if (!validBrowserOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  try {
    const partner = await findPartnerByAccessKey(String(req.body?.access_key ?? '').trim());
    if (!partner) return res.status(401).json({ error: 'Chave de acesso inválida' });
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
