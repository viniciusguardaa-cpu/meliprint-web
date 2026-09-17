import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

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
    <div className="min-h-screen bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="LabelGo" className="w-full max-w-xs h-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold text-gray-800 mb-2">Verifique seu e-mail</h1>
              <p className="text-sm text-gray-500 mb-6">
                Se existir uma conta para <strong>{email}</strong>, enviamos um link para redefinir a senha.
                O link expira em 30 minutos.
              </p>
              <Link to="/login" className="text-brand-600 hover:underline font-medium text-sm">
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-800 mb-1">Esqueci a senha</h1>
              <p className="text-sm text-gray-500 mb-6">
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
                <Button type="submit" disabled={submitting} className="w-full py-3 font-semibold">
                  {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
                </Button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-6">
                <Link to="/login" className="text-brand-600 hover:underline font-medium">
                  Voltar ao login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
