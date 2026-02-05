import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Check, Zap, Printer, Clock, Shield } from 'lucide-react';

export default function Pricing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
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
        credentials: 'include'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar checkout');
      }

      // Redirect to Mercado Pago checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Printer, text: 'Impressão ilimitada de etiquetas ZPL' },
    { icon: Zap, text: 'Download em lote de até 50 etiquetas' },
    { icon: Clock, text: 'Acesso 24/7 à plataforma' },
    { icon: Shield, text: 'Dados seguros e criptografados' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-[#2F6FED] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/">
            <img src="/logo.png" alt="MeliPrint Logo" className="h-10 w-auto" />
          </a>
          {user ? (
            <a
              href="/dashboard"
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/login"
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Entrar
            </a>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Imprima etiquetas do Mercado Livre em segundos
          </h1>
          <p className="text-xl text-gray-600">
            Agilize seu processo de envio com impressão direta em ZPL
          </p>
        </div>

        {/* Pricing Card */}
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-[#2F6FED]">
            {/* Badge */}
            <div className="bg-[#2F6FED] text-white text-center py-2 text-sm font-semibold">
              PLANO MENSAL
            </div>

            <div className="p-8">
              {/* Price */}
              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-2xl font-medium text-gray-500">R$</span>
                  <span className="text-6xl font-bold text-gray-900">29</span>
                  <span className="text-2xl font-medium text-gray-500">,90</span>
                </div>
                <p className="text-gray-500 mt-2">por mês</p>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-gray-700">{feature.text}</span>
                  </li>
                ))}
              </ul>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              {/* CTA Button */}
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full bg-[#2F6FED] hover:bg-[#1e4fbd] text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Assinar Agora
                  </>
                )}
              </button>

              <p className="text-center text-sm text-gray-500 mt-4">
                Cancele quando quiser. Sem fidelidade.
              </p>
            </div>
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
        </div>
      </main>
    </div>
  );
}
