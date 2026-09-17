import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { track } from '../lib/analytics';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { user, loading, login, loginWithEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    const err = await loginWithEmail(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setFormError(err);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <AuthShell
      subtitle="Impressão rápida de etiquetas de marketplace"
      footer="Conecte seus marketplaces e imprima etiquetas em segundos"
    >
      {(error || formError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {formError || 'Erro na autenticação. Tente novamente.'}
        </div>
      )}

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
            Senha
          </label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={submitting || loading}
          className="w-full"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>

      <div className="flex items-center justify-between mt-3 text-sm">
        <Link to="/esqueci-senha" className="text-primary hover:underline">
          Esqueci a senha
        </Link>
        <Link to="/cadastro" className="text-primary hover:underline font-medium">
          Criar conta
        </Link>
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground uppercase">ou</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={() => { track('ml_oauth_started'); login(); }}
        disabled={loading}
        className="w-full bg-yellow-400 hover:bg-yellow-400/90 text-foreground font-semibold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3 disabled:opacity-50"
      >
        {loading ? (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-foreground"></div>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            Entrar com Mercado Livre
          </>
        )}
      </button>
    </AuthShell>
  );
}
