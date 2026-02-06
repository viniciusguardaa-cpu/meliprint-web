import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function SubscriptionCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const res = await fetch('/api/subscription/status', {
          credentials: 'include'
        });
        const data = await res.json();

        if (data.hasSubscription) {
          setStatus('success');
          setTimeout(() => navigate('/dashboard'), 3000);
        } else {
          // Subscription may still be processing, wait and retry
          setTimeout(async () => {
            const retryRes = await fetch('/api/subscription/status', {
              credentials: 'include'
            });
            const retryData = await retryRes.json();

            if (retryData.hasSubscription) {
              setStatus('success');
              setTimeout(() => navigate('/dashboard'), 2000);
            } else {
              setStatus('error');
            }
          }, 3000);
        }
      } catch {
        setStatus('error');
      }
    };

    checkSubscription();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-brand-500 mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Processando assinatura...
            </h1>
            <p className="text-gray-600">
              Aguarde enquanto confirmamos seu pagamento.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Assinatura ativada!
            </h1>
            <p className="text-gray-600 mb-6">
              Obrigado! Você agora tem acesso completo ao Printly.
            </p>
            <p className="text-sm text-gray-500">
              Redirecionando para o dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Algo deu errado
            </h1>
            <p className="text-gray-600 mb-6">
              Não conseguimos confirmar sua assinatura. Se você completou o pagamento,
              aguarde alguns minutos e tente acessar novamente.
            </p>
            <div className="flex gap-3 justify-center">
              <a
                href="/pricing"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg transition-colors"
              >
                Tentar novamente
              </a>
              <a
                href="/dashboard"
                className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-lg transition-colors"
              >
                Ir para Dashboard
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
