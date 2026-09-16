import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Check, Zap, Shield, Loader2 } from 'lucide-react';
import Header from '../components/Header';

interface Plan {
  id: string;
  name: string;
  description: string;
  autoPrint: boolean;
  features: string[];
  price: { amount: number; currency: string; billingPeriod: string } | null;
  experimentVariant: string | null;
}

export default function Pricing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const visitorKey = localStorage.getItem('printly_visitor_key') || '';
        const res = await fetch(`/api/plans${visitorKey ? `?visitor_key=${visitorKey}` : ''}`);
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
    fetchPlans();
  }, []);

  const handleSubscribe = async (planId: string, trial: boolean = false) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, trial })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar checkout');
      }

      // If trial, redirect to dashboard (no MP checkout needed)
      if (data.trial) {
        window.location.href = '/dashboard';
        return;
      }

      // Redirect to Mercado Pago checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar');
    } finally {
      setLoading(false);
    }
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Header showDashboard />

      <main className="max-w-5xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Imprima etiquetas do Mercado Livre em segundos
          </h1>
          <p className="text-xl text-gray-600">
            Teste grátis por 7 dias. Sem cartão de crédito.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const isPro = plan.id === 'pro';
            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl shadow-xl overflow-hidden border-2 ${isPro ? 'border-brand-500' : 'border-gray-200'
                  }`}
              >
                {isPro && (
                  <div className="bg-brand-500 text-white text-center py-2 text-sm font-semibold">
                    RECOMENDADO
                  </div>
                )}
                {!isPro && (
                  <div className="bg-gray-100 text-gray-600 text-center py-2 text-sm font-semibold">
                    PLANO MENSAL
                  </div>
                )}

                <div className="p-8">
                  {/* Plan name */}
                  <h2 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h2>
                  <p className="text-gray-500 text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="text-center mb-8">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-medium text-gray-500">R$</span>
                      <span className="text-6xl font-bold text-gray-900">
                        {plan.price ? Math.floor(plan.price.amount) : '-'}
                      </span>
                      <span className="text-2xl font-medium text-gray-500">
                        ,{plan.price ? (plan.price.amount % 1).toFixed(2).slice(2) : '00'}
                      </span>
                    </div>
                    <p className="text-gray-500 mt-2">por mês</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="text-gray-700 text-sm">{feature}</span>
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
                    <button
                      onClick={() => handleSubscribe(plan.id, true)}
                      disabled={loading}
                      className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Testar grátis por 7 dias
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.id, false)}
                      disabled={loading}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assinar Agora
                    </button>
                  )}

                  <p className="text-center text-sm text-gray-500 mt-4">
                    Cancele quando quiser. Sem fidelidade.
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust badges */}
        <div className="mt-8 flex items-center justify-center gap-6 text-gray-400 text-sm">
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
