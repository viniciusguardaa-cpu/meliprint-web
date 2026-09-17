import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  consumePairingCode,
  getAutoPrintConfig,
  upsertAutoPrintConfig
} from '../db.js';

const router = Router();

// Pairing codes are short-lived secrets; keep brute-force attempts expensive.
const pairLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/agent/pair — exchange a pairing code (generated in the web panel,
 * valid for ~10min, single use) for a durable agent token.
 *
 * This is the only unauthenticated provisioning endpoint: the code itself is
 * the credential, it expires quickly, and it is consumed on first use.
 *
 * Response: { agentToken, printerName, agentId }
 */
router.post('/pair', pairLimiter, async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code || code.length > 20) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const pairing = await consumePairingCode(code);
    if (!pairing) {
      return res.status(400).json({ error: 'Código inválido, expirado ou já utilizado' });
    }

    // Ensure an agent token exists for this account (reuse if already enabled
    // so a re-pair doesn't break a running agent).
    const config = await getAutoPrintConfig(pairing.user_id);
    const agentToken = config?.agent_token || crypto.randomBytes(32).toString('hex');

    await upsertAutoPrintConfig(pairing.user_id, {
      agentToken,
    });

    res.json({
      agentToken,
      printerName: config?.printer_name || null,
      agentId: `agent-${crypto.randomUUID().slice(0, 8)}`,
    });
  } catch (error) {
    console.error('Agent pairing error:', error);
    res.status(500).json({ error: 'Falha no pareamento' });
  }
});

export default router;
