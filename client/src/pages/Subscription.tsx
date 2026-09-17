import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { CreditCard, Calendar, AlertTriangle, ArrowLeft, Loader2, Zap } from 'lucide-react';
import Header from '../components/Header';
import toast from 'react-hot-toast';
import { getVisitorKey } from '../lib/analytics';

export default function Subscription() {
  const navigate = useNavigate();
  useAuth();
  const { subscription, loading } = useSubscription();
  const [canceling, setCanceling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const isTrialing = subscription?.status === 'trialing';
  const isCancelledWithAccess = subscription?.status === 'cancelled' && !!subscription?.accessUntil;

  const handleCancel = async () => {
    setCanceling(true);

    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cancelar assinatura');
      }

      toast.success('Assinatura cancelada. Acesso mantido até o fim do período.');
      setShowCancelModal(false);

      // Redirect after a delay
      setTimeout(() => navigate('/pricing'), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar');
    } finally {
      setCanceling(false);
    }
  };

  /** Convert trial → paid (or re-subscribe) via Mercado Pago checkout. */
  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId: subscription?.planId || 'pro',
          trial: false,
          visitorKey: getVisitorKey(),
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar checkout');
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao assinar');
      setSubscribing(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const statusLabel = (status: string | null | undefined) => {
    switch (status) {
      case 'authorized':
      case 'active': return 'Ativa';
      case 'trialing': return 'Período de teste';
      case 'cancelled': return 'Cancelada';
      case 'paused': return 'Pagamento pendente';
      case 'pending': return 'Pagamento pendente';
      case 'trial_expired': return 'Teste expirado';
      case 'expired': return 'Expirada';
      default: return status || '-';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showDashboard />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Dashboard
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Minha Assinatura</h1>

        {subscription?.hasSubscription ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden animate-fade-in">
            {/* Status badge */}
            <div className={`text-white text-center py-2 text-sm font-semibold ${isCancelledWithAccess ? 'bg-yellow-500' : isTrialing ? 'bg-blue-500' : 'bg-green-500'
              }`}>
              {isCancelledWithAccess
                ? 'CANCELADA — ACESSO ATÉ O FIM DO PERÍODO'
                : isTrialing
                  ? 'PERÍODO DE TESTE ATIVO'
                  : 'ASSINATURA ATIVA'}
            </div>

            <div className="p-6">
              {/* Plan info */}
              <div className="flex items-center justify-between mb-6 pb-6 border-b">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {subscription.planName || 'LabelGo Pro'}
                  </h2>
                  <p className="text-gray-500">{isTrialing ? 'Teste gratuito' : 'Plano mensal'}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">
                    R$ {subscription.price?.toFixed(2).replace('.', ',')}
                  </div>
                  <p className="text-gray-500">por mês</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-medium text-gray-900">
                      {statusLabel(subscription.status)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {isTrialing
                        ? 'Teste termina em'
                        : isCancelledWithAccess
                          ? 'Acesso até'
                          : 'Próxima cobrança'}
                    </p>
                    <p className="font-medium text-gray-900">
                      {isTrialing
                        ? `${formatDate(subscription.trialEndsAt)} (${subscription.trialDaysRemaining ?? '-'} dia(s) restantes)`
                        : isCancelledWithAccess
                          ? formatDate(subscription.accessUntil)
                          : formatDate(subscription.currentPeriodEnd)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Trial conversion CTA */}
              {isTrialing && (
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
                >
                  {subscribing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Assinar agora — R$ {subscription.price?.toFixed(2).replace('.', ',')}/mês
                    </>
                  )}
                </button>
              )}

              {/* Cancel button (hide once already cancelled) */}
              {!isCancelledWithAccess && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full border border-red-300 text-red-600 hover:bg-red-50 font-medium py-3 px-6 rounded-lg transition-colors"
                >
                  {isTrialing ? 'Cancelar teste' : 'Cancelar assinatura'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Sem assinatura ativa
            </h2>
            <p className="text-gray-500 mb-6">
              Assine para ter acesso completo ao LabelGo
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              Ver planos
            </button>
          </div>
        )}
      </main>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                {isTrialing ? 'Cancelar teste?' : 'Cancelar assinatura?'}
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              {isTrialing
                ? 'Seu acesso de teste será encerrado. O teste gratuito só pode ser usado uma vez por conta.'
                : 'Tem certeza que deseja cancelar sua assinatura? Você manterá acesso até o fim do período já pago.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                Manter assinatura
              </button>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {canceling ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Sim, cancelar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
