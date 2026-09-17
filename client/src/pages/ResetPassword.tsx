import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Link expirado ou inválido. Peça um novo.');
        return;
      }
      navigate('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="LabelGo" className="w-full max-w-xs h-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {!token ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold text-gray-800 mb-2">Link inválido</h1>
              <p className="text-sm text-gray-500 mb-6">
                Este link de redefinição está incompleto ou expirou.
              </p>
              <Link to="/esqueci-senha" className="text-brand-600 hover:underline font-medium text-sm">
                Pedir novo link
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-800 mb-6">Redefinir senha</h1>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
                  <Input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full"
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full py-3 font-semibold">
                  {submitting ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
