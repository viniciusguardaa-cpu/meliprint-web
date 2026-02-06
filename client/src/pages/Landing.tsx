import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Printer,
  Zap,
  Clock,
  Shield,
  CheckCircle,
  ArrowRight,
  Package,
  Download,
  RefreshCw
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/pricing');
    }
  };

  const features = [
    {
      icon: Zap,
      title: 'Impressão Instantânea',
      description: 'Gere etiquetas ZPL em segundos, direto para sua impressora térmica.'
    },
    {
      icon: Package,
      title: 'Seleção em Lote',
      description: 'Selecione até 50 etiquetas de uma vez e baixe todas juntas.'
    },
    {
      icon: RefreshCw,
      title: 'Sincronização Automática',
      description: 'Seus envios são atualizados em tempo real com o Mercado Livre.'
    },
    {
      icon: Shield,
      title: 'Seguro e Confiável',
      description: 'Conexão via OAuth oficial do Mercado Livre. Seus dados protegidos.'
    }
  ];

  const benefits = [
    'Economize horas de trabalho manual',
    'Reduza erros na impressão de etiquetas',
    'Interface simples e intuitiva',
    'Suporte a impressoras térmicas ZPL',
    'Funciona com qualquer navegador',
    'Acesse de qualquer lugar'
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <img src="/logoazul.png" alt="Printly" className="h-8 sm:h-12 w-auto" />
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-brand-500 hover:bg-brand-600 text-white px-4 sm:px-6 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors"
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="text-gray-600 hover:text-gray-900 px-3 sm:px-4 py-2 text-sm sm:text-base font-medium transition-colors"
                >
                  Entrar
                </button>
                <button
                  onClick={() => navigate('/pricing')}
                  className="bg-brand-500 hover:bg-brand-600 text-white px-4 sm:px-6 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors"
                >
                  Começar
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 pt-8 sm:pt-12 pb-10 sm:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left - Text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-5">
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Para vendedores do Mercado Livre
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-5 leading-tight">
                Imprima etiquetas do <span className="text-brand-500">Mercado Livre</span> em segundos
              </h1>

              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed">
                Acelere seu processo de envio com impressão direta em formato ZPL.
                Sem complicação, sem perda de tempo.
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-5">
                <button
                  onClick={handleCTA}
                  className="bg-brand-500 hover:bg-brand-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-blue-200"
                >
                  Começar Agora
                  <ArrowRight className="w-5 h-5" />
                </button>
                <div className="text-left">
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">R$ 29,90</div>
                  <div className="text-gray-500 text-xs sm:text-sm">por mês</div>
                </div>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-6 mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Impressões ilimitadas
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Cancele quando quiser
                </div>
              </div>
            </div>

            {/* Right - Demo */}
            <div className="relative hidden md:block">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-3xl blur-2xl opacity-30"></div>
              <div className="relative bg-white rounded-2xl shadow-2xl border overflow-hidden">
                <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-2 border-b">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="p-5 bg-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-500 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">15 envios prontos</div>
                        <div className="text-sm text-gray-500">Última atualização: agora</div>
                      </div>
                    </div>
                    <button className="bg-brand-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium">
                      <Download className="w-4 h-4" />
                      Imprimir Selecionados
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-white p-3.5 rounded-lg border flex items-center gap-4">
                        <div className="w-5 h-5 border-2 border-brand-500 rounded bg-brand-500 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">Envio #{4820000 + i}</div>
                          <div className="text-sm text-gray-500">Comprador{i} • 2x Produto exemplo</div>
                        </div>
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                          Pronto
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
              Tudo que você precisa para agilizar seus envios
            </h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
              Desenvolvido por vendedores, para vendedores. Focado em simplicidade e eficiência.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-4 sm:p-6">
                <div className="w-11 h-11 sm:w-14 sm:h-14 bg-blue-100 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <feature.icon className="w-5 h-5 sm:w-7 sm:h-7 text-brand-500" />
                </div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-base text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-10 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
                Pare de perder tempo com etiquetas
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8">
                Sabemos como é frustrante o processo manual de impressão de etiquetas.
                Por isso criamos uma solução que funciona direto com sua impressora térmica.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 sm:p-8 rounded-2xl shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="w-8 h-8 text-brand-500" />
                <div>
                  <div className="text-3xl font-bold text-gray-900">5 min</div>
                  <div className="text-gray-500">tempo médio economizado por envio</div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="text-gray-600">Processo manual</span>
                  <span className="text-red-500 font-medium">~7 minutos</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="text-gray-600">Com Printly</span>
                  <span className="text-green-500 font-medium">~2 minutos</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-900 font-medium">50 envios por dia</span>
                  <span className="text-brand-500 font-bold">4+ horas economizadas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing CTA Section */}
      <section className="py-10 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
            Comece a economizar tempo hoje
          </h2>
          <p className="text-gray-600 mb-8">
            Teste agora e veja a diferença no seu processo de envio.
          </p>

          <div className="bg-gradient-to-r from-brand-500 to-brand-600 p-6 sm:p-8 rounded-2xl text-white">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl sm:text-5xl font-bold">R$ 29,90</span>
              <span className="text-blue-200">/mês</span>
            </div>
            <p className="text-blue-100 mb-6">
              Acesso completo • Impressões ilimitadas • Cancele quando quiser
            </p>
            <button
              onClick={handleCTA}
              className="bg-white text-brand-500 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors"
            >
              Começar Agora
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Printly" className="h-10 w-auto brightness-0 invert" />
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a href="/pricing" className="hover:text-white transition-colors">Preços</a>
              <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-white transition-colors">Privacidade</a>
            </div>
            <div className="text-sm">
              © {new Date().getFullYear()} Printly. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
