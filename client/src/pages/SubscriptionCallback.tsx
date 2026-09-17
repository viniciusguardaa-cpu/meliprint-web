import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-surface rounded-2xl border border-border shadow-lg p-8 max-w-md w-full mx-4 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Processando assinatura...
            </h1>
            <p className="text-muted-foreground">
              Aguarde enquanto confirmamos seu pagamento.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Assinatura ativada!
            </h1>
            <p className="text-muted-foreground mb-6">
              Obrigado! Você agora tem acesso completo ao LabelGo.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecionando para o dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Algo deu errado
            </h1>
            <p className="text-muted-foreground mb-6">
              Não conseguimos confirmar sua assinatura. Se você completou o pagamento,
              aguarde alguns minutos e tente acessar novamente.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => { window.location.href = '/pricing'; }}
              >
                Tentar novamente
              </Button>
              <Button
                size="lg"
                onClick={() => { window.location.href = '/dashboard'; }}
              >
                Ir para Dashboard
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
