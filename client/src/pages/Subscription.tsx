import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { CreditCard, Calendar, AlertTriangle, ArrowLeft, Loader2, Zap } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import toast from 'react-hot-toast';

export default function Subscription() {
  const navigate = useNavigate();
  useAuth();
  const { subscription, loading } = useSubscription();
  const [canceling, setCanceling] = useState(false);
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

  /** Trial → paid conversion goes through the dedicated signup page. */
  const handleSubscribe = () => {
    navigate('/pricing');
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
      case 'cancelled':
      case 'canceled': return 'Cancelada';
      case 'paused': return 'Pagamento pendente';
      case 'pending': return 'Pagamento pendente';
      case 'trial_expired': return 'Teste expirado';
      case 'expired': return 'Expirada';
      default: return status || '-';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header showDashboard />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Dashboard
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-6">Minha Assinatura</h1>

        {subscription?.hasSubscription ? (
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-fade-in">
            {/* Status badge */}
            <div className={`text-center py-2 text-sm font-semibold ${isCancelledWithAccess ? 'bg-warning text-warning-foreground' : isTrialing ? 'bg-secondary text-secondary-foreground' : 'bg-success text-success-foreground'
              }`}>
              {isCancelledWithAccess
                ? 'CANCELADA — ACESSO ATÉ O FIM DO PERÍODO'
                : isTrialing
                  ? 'PERÍODO DE TESTE ATIVO'
                  : 'ASSINATURA ATIVA'}
            </div>

            <div className="p-6">
              {/* Plan info */}
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {subscription.planName || 'LabelGo Pro'}
                  </h2>
                  <p className="text-muted-foreground">{isTrialing ? 'Teste gratuito' : 'Plano mensal'}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">
                    R$ {subscription.price?.toFixed(2).replace('.', ',')}
                  </div>
                  <p className="text-muted-foreground">por mês</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/60 rounded-full flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="font-medium text-foreground">
                      {statusLabel(subscription.status)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isTrialing
                        ? 'Teste termina em'
                        : isCancelledWithAccess
                          ? 'Acesso até'
                          : 'Próxima cobrança'}
                    </p>
                    <p className="font-medium text-foreground">
                      {isTrialing
                        ? `${formatDate(subscription.trialEndsAt)} (${subscription.trialDaysRemaining ?? '-'} dia(s) restantes)`
                        : isCancelledWithAccess
                          ? formatDate(subscription.accessUntil)
                          : formatDate(subscription.currentPeriodEnd)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Trial conversion CTA — entry point; the final action lives on /pricing */}
              {isTrialing && (
                <Button
                  size="lg"
                  onClick={handleSubscribe}
                  className="w-full mb-3"
                >
                  <Zap className="w-5 h-5" />
                  Assinar agora — R$ {subscription.price?.toFixed(2).replace('.', ',')}/mês
                </Button>
              )}

              {/* Cancel button (hide once already cancelled) */}
              {!isCancelledWithAccess && (
                <Button
                  variant="destructiveOutline"
                  size="lg"
                  onClick={() => setShowCancelModal(true)}
                  className="w-full"
                >
                  {isTrialing ? 'Cancelar teste' : 'Cancelar assinatura'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Sem assinatura ativa
            </h2>
            <p className="text-muted-foreground mb-6">
              Assine para ter acesso completo ao LabelGo
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/pricing')}
            >
              Ver planos
            </Button>
          </div>
        )}
      </main>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl border border-border max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {isTrialing ? 'Cancelar teste?' : 'Cancelar assinatura?'}
              </h3>
            </div>

            <p className="text-muted-foreground mb-6">
              {isTrialing
                ? 'Seu acesso de teste será encerrado. O teste gratuito só pode ser usado uma vez por conta.'
                : 'Tem certeza que deseja cancelar sua assinatura? Você manterá acesso até o fim do período já pago.'}
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className="flex-1"
              >
                Manter assinatura
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1"
              >
                {canceling ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Sim, cancelar'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
