import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  consumePairingCode,
  findPairingCode,
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
    // Strip anything that is not a code character — users may type/copy the
    // code with spaces, dashes or lowercase letters.
    const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code || code.length > 20) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const pairing = await consumePairingCode(code);
    if (!pairing) {
      const row = await findPairingCode(code);
      console.warn(
        `[agent-pair] rejected len=${code.length} exists=${Boolean(row)} ` +
        `used=${Boolean(row?.used_at)} expired=${row ? new Date(row.expires_at) < new Date() : 'n/a'}`
      );
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
