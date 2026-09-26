import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';

type CheckoutSubscription = {
  id: string;
  status: string;
  price: number;
  currency: string;
};

type GoogleTag = (command: 'event', eventName: 'conversion', params: {
  send_to: string;
  value: number;
  currency: 'BRL';
  transaction_id: string;
}) => void;

function trackSubscriptionConversion(subscription: CheckoutSubscription) {
  // A return visit is not proof of purchase. Only the exact MP preapproval
  // started in this browser and confirmed by our server can be counted.
  if (!['authorized', 'active'].includes(subscription.status) ||
      subscription.currency !== 'BRL' || Number(subscription.price) <= 0) return;

  const storageKey = `google-ads-conversion:${subscription.id}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
  } catch {
    // Ads also deduplicates by transaction_id when storage is unavailable.
  }

  const gtag = (window as typeof window & { gtag?: GoogleTag }).gtag;
  if (!gtag) return;
  gtag('event', 'conversion', {
    send_to: 'AW-18467947989/fgqECJjRpoEdENWLmuZE',
    value: Number(subscription.price),
    currency: 'BRL',
    transaction_id: subscription.id,
  });
  try {
    window.localStorage.setItem(storageKey, '1');
    window.sessionStorage.removeItem('labelgo:pending-preapproval');
  } catch {
    // Storage can be unavailable; server reconciliation still controls firing.
  }
}

async function confirmedCheckout(checkoutId: string): Promise<CheckoutSubscription | null> {
  const response = await fetch(`/api/subscriptions/${encodeURIComponent(checkoutId)}`, {
    credentials: 'include',
  });
  if (!response.ok) return null;
  const subscription: CheckoutSubscription = await response.json();
  return subscription.id === checkoutId &&
    ['authorized', 'active'].includes(subscription.status) &&
    subscription.currency === 'BRL' && Number(subscription.price) > 0
      ? subscription : null;
}

export default function SubscriptionCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const params = new URLSearchParams(window.location.search);
    let storedId: string | null = null;
    try { storedId = window.sessionStorage.getItem('labelgo:pending-preapproval'); } catch { /* unavailable */ }
    const returnId = params.get('preapproval_id') || params.get('preapprovalId');
    // A query parameter alone cannot prove this browser began the checkout.
    const checkoutId = storedId && (!returnId || returnId === storedId) ? storedId : null;

    const checkSubscription = async (attempt = 0) => {
      if (cancelled) return;
      try {
        if (checkoutId) {
          const checkout = await confirmedCheckout(checkoutId);
          if (cancelled) return;
          if (checkout) {
            trackSubscriptionConversion(checkout);
            setStatus('success');
            timer = setTimeout(() => navigate('/dashboard'), 3000);
            return;
          }
        } else {
          // Historic returns without a stored checkout can show existing access,
          // but are never counted as new Ads purchases.
          const res = await fetch('/api/subscription/status', { credentials: 'include' });
          if (res.ok && (await res.json()).hasSubscription) {
            if (!cancelled) {
              setStatus('success');
              timer = setTimeout(() => navigate('/dashboard'), 3000);
            }
            return;
          }
        }
      } catch { /* Retry webhook reconciliation on a temporary failure. */ }
      if (cancelled) return;
      if (attempt < 4) timer = setTimeout(() => checkSubscription(attempt + 1), 3000);
      else setStatus('error');
    };
    void checkSubscription();
    return () => { cancelled = true; clearTimeout(timer); };
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
