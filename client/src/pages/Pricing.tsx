import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Check, Zap, Shield, Loader2 } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import { getVisitorKey, track } from '../lib/analytics';

interface Plan {
  id: string;
  name: string;
  description: string;
  autoPrint: boolean;
  features: string[];
  price: { amount: number; currency: string; billingPeriod: string } | null;
  experimentVariant: string | null;
}

interface SubscriptionStatus {
  hasSubscription: boolean;
  status: string | null;
  canTrial?: boolean;
  trialDaysRemaining?: number | null;
}

export default function Pricing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  // One idempotency key per checkout intent — double clicks/retries replay
  // the same checkout instead of creating duplicate charges.
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    track('pricing_view');
    const fetchPlans = async () => {
      try {
        const visitorKey = getVisitorKey();
        const res = await fetch(`/api/plans?visitor_key=${encodeURIComponent(visitorKey)}`);
        if (res.ok) {
          const data = await res.json();
          setPlans(data.plans || []);
        }
      } catch {
        // Fallback: show nothing, user can still try
      } finally {
        setPlansLoading(false);
      }
    };
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/subscription/status', { credentials: 'include' });
        if (res.ok) setSubStatus(await res.json());
      } catch {
        // not logged in or unavailable — default UI
      }
    };
    fetchPlans();
    fetchStatus();
  }, []);

  const handleSubscribe = async (planId: string, trial: boolean = false) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setLoading(true);
    setError(null);

    try {
      track(trial ? 'trial_started' : 'checkout_started', { plan_id: planId });
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId,
          trial,
          visitorKey: getVisitorKey(),
          idempotencyKey: idempotencyKey.current,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'trial_already_used') {
          setSubStatus(prev => ({ ...(prev || { hasSubscription: false, status: null }), canTrial: false }));
          throw new Error('O período de teste gratuito já foi utilizado. Assine o Pro para continuar.');
        }
        if (data.error === 'checkout_in_progress') {
          throw new Error('Já existe um checkout em andamento. Aguarde alguns segundos e tente novamente.');
        }
        throw new Error(data.error || 'Erro ao criar checkout');
      }

      // If trial, redirect to dashboard (no MP checkout needed)
      if (data.trial) {
        window.location.href = '/dashboard';
        return;
      }

      // Redirect to Mercado Pago checkout (same URL on replayed requests)
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar');
      // New key for the next attempt so a genuinely new try isn't deduped
      // against a failed/abandoned checkout.
      idempotencyKey.current = crypto.randomUUID();
    } finally {
      setLoading(false);
    }
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const isTrialing = subStatus?.status === 'trialing';
  const canTrial = subStatus?.canTrial !== false && !isTrialing;

  return (
    <div className="min-h-screen bg-background">
      <Header showDashboard />

      <main className="max-w-5xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Imprima etiquetas do Mercado Livre em segundos
          </h1>
          <p className="text-xl text-muted-foreground">
            {canTrial
              ? 'Teste grátis por 7 dias. Sem cartão de crédito.'
              : 'Assine e imprima em segundos — direto do navegador.'}
          </p>
          {isTrialing && (
            <p className="mt-3 inline-block bg-secondary/60 text-secondary-foreground px-4 py-2 rounded-full text-sm font-medium">
              Trial ativo — restam {subStatus?.trialDaysRemaining ?? '-'} dia(s)
            </p>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const isPro = plan.id === 'pro';
            return (
              <div
                key={plan.id}
                className={`bg-surface rounded-2xl shadow-lg overflow-hidden border-2 ${isPro ? 'border-primary' : 'border-border'
                  }`}
              >
                {isPro && (
                  <div className="bg-secondary text-secondary-foreground text-center py-2 text-sm font-semibold">
                    RECOMENDADO
                  </div>
                )}
                {!isPro && (
                  <div className="bg-muted text-muted-foreground text-center py-2 text-sm font-semibold">
                    PLANO MENSAL
                  </div>
                )}

                <div className="p-8">
                  {/* Plan name */}
                  <h2 className="text-xl font-bold text-foreground mb-1">{plan.name}</h2>
                  <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="text-center mb-8">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-medium text-muted-foreground">R$</span>
                      <span className="text-6xl font-bold text-foreground">
                        {plan.price ? Math.floor(plan.price.amount) : '-'}
                      </span>
                      <span className="text-2xl font-medium text-muted-foreground">
                        ,{plan.price ? (plan.price.amount % 1).toFixed(2).slice(2) : '00'}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-2">por mês</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="text-foreground/80 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Error */}
                  {error && isPro && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                      {error}
                    </div>
                  )}

                  {/* CTA */}
                  {isPro ? (
                    <>
                      {canTrial && (
                        <Button
                          size="xl"
                          onClick={() => handleSubscribe(plan.id, true)}
                          disabled={loading}
                          className="w-full mb-3"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <Zap className="w-5 h-5" />
                              Testar grátis por 7 dias
                            </>
                          )}
                        </Button>
                      )}
                      <button
                        onClick={() => handleSubscribe(plan.id, false)}
                        disabled={loading}
                        className={`w-full font-semibold py-4 px-6 rounded-xl transition-all duration-150 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 mb-3 ${canTrial
                          ? 'bg-foreground text-white hover:bg-foreground/90'
                          : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                          }`}
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          isTrialing ? 'Assinar agora (converter trial)' : 'Assinar Pro agora'
                        )}
                      </button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="xl"
                      onClick={() => handleSubscribe(plan.id, false)}
                      disabled={loading}
                      className="w-full"
                    >
                      Assinar Agora
                    </Button>
                  )}

                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Cancele quando quiser. Sem fidelidade.
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust badges */}
        <div className="mt-8 flex items-center justify-center gap-6 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Pagamento seguro
          </div>
          <div className="flex items-center gap-2">
            <img src="https://http2.mlstatic.com/frontend-assets/mp-web-navigation/badge.svg" alt="Mercado Pago" className="h-5" />
          </div>
        </div>
      </main>
    </div>
  );
}
