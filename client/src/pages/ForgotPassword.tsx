import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import AuthShell from '../components/AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
    } finally {
      setSubmitting(false);
      // Always show the same success state — no account enumeration.
      setSent(true);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">Verifique seu e-mail</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Se existir uma conta para <strong>{email}</strong>, enviamos um link para redefinir a senha.
            O link expira em 30 minutos.
          </p>
          <Link to="/login" className="text-primary hover:underline font-medium text-sm">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-foreground mb-1">Esqueci a senha</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Informe seu e-mail para receber o link de redefinição.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              className="w-full"
            />
            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-6">
            <Link to="/login" className="text-primary hover:underline font-medium">
              Voltar ao login
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
