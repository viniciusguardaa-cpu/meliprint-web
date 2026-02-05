import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { CreditCard, Calendar, AlertTriangle, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';

export default function Subscription() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { subscription, loading } = useSubscription();
  const [canceling, setCanceling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCancel = async () => {
    setCanceling(true);
    setError(null);

    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cancelar assinatura');
      }

      setSuccess('Assinatura cancelada com sucesso. Você ainda terá acesso até o fim do período atual.');
      setShowCancelModal(false);
      
      // Redirect after a delay
      setTimeout(() => navigate('/pricing'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar');
    } finally {
      setCanceling(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F6FED]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#2F6FED] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="MeliPrint Logo" className="h-10 w-auto" />
          <div className="flex items-center gap-4">
            <span className="text-white font-medium">{user?.nickname}</span>
            <button
              onClick={logout}
              className="bg-[#1e4fbd] hover:bg-[#163a9a] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

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

        {/* Success message */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {subscription?.hasSubscription ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            {/* Status badge */}
            <div className="bg-green-500 text-white text-center py-2 text-sm font-semibold">
              ASSINATURA ATIVA
            </div>

            <div className="p-6">
              {/* Plan info */}
              <div className="flex items-center justify-between mb-6 pb-6 border-b">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {subscription.planName || 'MeliPrint Pro'}
                  </h2>
                  <p className="text-gray-500">Plano mensal</p>
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
                    <p className="font-medium text-gray-900 capitalize">
                      {subscription.status === 'authorized' ? 'Ativa' : subscription.status}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Próxima cobrança</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(subscription.currentPeriodEnd)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cancel button */}
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full border border-red-300 text-red-600 hover:bg-red-50 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Cancelar assinatura
              </button>
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
              Assine para ter acesso completo ao MeliPrint
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="bg-[#2F6FED] hover:bg-[#1e4fbd] text-white font-semibold py-3 px-8 rounded-lg transition-colors"
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
                Cancelar assinatura?
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso às funcionalidades 
              premium ao final do período atual.
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
