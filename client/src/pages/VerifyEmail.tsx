import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

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
    <AuthShell>
      <div className="text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Verificando seu e-mail...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle className="w-10 h-10 text-success mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-foreground mb-2">E-mail confirmado!</h1>
            <p className="text-sm text-muted-foreground mb-6">Sua conta está verificada.</p>
            <Link to="/dashboard" className="text-primary hover:underline font-medium">
              Ir para o dashboard
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-danger mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-foreground mb-2">Link inválido</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Este link de verificação expirou ou já foi utilizado.
            </p>
            <Link to="/dashboard" className="text-primary hover:underline font-medium">
              Voltar ao dashboard
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
