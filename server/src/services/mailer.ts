/**
 * Transactional email. Uses Resend when RESEND_API_KEY is configured;
 * otherwise logs the message so auth flows remain usable in dev.
 * Set MAIL_FROM to a verified sender (e.g. 'LabelGo <no-reply@labelgo.com.br>').
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'LabelGo <no-reply@labelgo.com.br>';

  if (!apiKey) {
    console.log(`[mailer] RESEND_API_KEY not set — email not sent.\n  To: ${to}\n  Subject: ${subject}\n  Body: ${html}`);
    return;
  }

  const resp = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to send email: ${resp.status} ${err}`);
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await sendMail(
    to,
    'Confirme seu e-mail — LabelGo',
    `<p>Confirme seu e-mail clicando no link abaixo:</p>
     <p><a href="${verifyUrl}">${verifyUrl}</a></p>
     <p>Se você não criou uma conta no LabelGo, ignore este e-mail.</p>`
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail(
    to,
    'Redefinir senha — LabelGo',
    `<p>Recebemos um pedido para redefinir a senha da sua conta:</p>
     <p><a href="${resetUrl}">${resetUrl}</a></p>
     <p>O link expira em 30 minutos. Se não foi você, ignore este e-mail.</p>`
  );
}
