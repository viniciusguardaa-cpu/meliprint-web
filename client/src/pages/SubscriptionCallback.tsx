import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';

type SubscriptionStatus = {
  hasSubscription: boolean;
  status?: string | null;
  currentPeriodEnd?: string | null;
  planId?: string | null;
  price?: number | null;
  isFreeAccess?: boolean;
};

type GoogleTag = (command: 'event', eventName: 'conversion', params: {
  send_to: string;
  value: number;
  currency: 'BRL';
  transaction_id: string;
}) => void;

function trackSubscriptionConversion(subscription: SubscriptionStatus) {
  const isPaidSubscription =
    subscription.hasSubscription &&
    (subscription.status === 'authorized' || subscription.status === 'active') &&
    !subscription.isFreeAccess &&
    Number(subscription.price) > 0;

  if (!isPaidSubscription) return;

  const params = new URLSearchParams(window.location.search);
  const transactionId =
    params.get('preapproval_id') ||
    params.get('preapprovalId') ||
    `${subscription.planId || 'subscription'}-${subscription.currentPeriodEnd || 'activated'}`;
  const storageKey = `google-ads-conversion:${transactionId}`;

  try {
    if (window.localStorage.getItem(storageKey)) return;
  } catch {
    // Conversion deduplication also happens in Google Ads via transaction_id.
  }

  const gtag = (window as typeof window & { gtag?: GoogleTag }).gtag;
  if (!gtag) return;

  gtag('event', 'conversion', {
    send_to: 'AW-18467947989/fgqECJjRpoEdENWLmuZE',
    value: Number(subscription.price),
    currency: 'BRL',
    transaction_id: transactionId,
  });

  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Storage may be unavailable in privacy-focused browsing modes.
  }
}

export default function SubscriptionCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const res = await fetch('/api/subscription/status', {
          credentials: 'include'
        });
        const data: SubscriptionStatus = await res.json();

        if (data.hasSubscription) {
          trackSubscriptionConversion(data);
          setStatus('success');
          setTimeout(() => navigate('/dashboard'), 3000);
        } else {
          // Subscription may still be processing, wait and retry
          setTimeout(async () => {
            const retryRes = await fetch('/api/subscription/status', {
              credentials: 'include'
            });
            const retryData: SubscriptionStatus = await retryRes.json();

            if (retryData.hasSubscription) {
              trackSubscriptionConversion(retryData);
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
