import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token })
    })
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {status === 'loading' && (
            <p className="text-gray-600">Verificando seu e-mail...</p>
          )}
          {status === 'ok' && (
            <>
              <h1 className="text-lg font-semibold text-gray-800 mb-2">E-mail confirmado!</h1>
              <p className="text-sm text-gray-500 mb-6">Sua conta está verificada.</p>
              <Link to="/dashboard" className="text-brand-600 hover:underline font-medium">
                Ir para o dashboard
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="text-lg font-semibold text-gray-800 mb-2">Link inválido</h1>
              <p className="text-sm text-gray-500 mb-6">
                Este link de verificação expirou ou já foi utilizado.
              </p>
              <Link to="/dashboard" className="text-brand-600 hover:underline font-medium">
                Voltar ao dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
