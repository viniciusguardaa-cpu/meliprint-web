import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getVisitorKey, track, captureUTM } from '../lib/analytics';
import { Button } from '../components/ui/button';
import Logo from '../components/Logo';
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

interface Plan {
  id: string;
  name: string;
  description: string;
  autoPrint: boolean;
  features: string[];
  price: { amount: number; currency: string; billingPeriod: string } | null;
  experimentVariant: string | null;
}

function formatBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proPrice, setProPrice] = useState<number | null>(null);

  useEffect(() => {
    captureUTM();
    track('landing_view', { path: window.location.pathname });
    const fetchPlans = async () => {
      try {
        const visitorKey = getVisitorKey();
        const res = await fetch(`/api/plans?visitor_key=${encodeURIComponent(visitorKey)}`);
        if (res.ok) {
          const data = await res.json();
          const pro = (data.plans || []).find((p: Plan) => p.id === 'pro');
          if (pro?.price) setProPrice(pro.price.amount);
        }
      } catch {
        // ignore — fallback to no price display
      }
    };
    fetchPlans();
  }, []);

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
      description: 'Gere etiquetas em segundos e imprima pelo navegador — sem instalar nada.'
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
    'Sem instalação — funciona em qualquer navegador',
    'Acesse de qualquer lugar'
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo className="h-10 sm:h-12" />
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <Button onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  Entrar
                </Button>
                <Button onClick={() => navigate('/pricing')}>
                  Começar
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-secondary pt-8 sm:pt-12 pb-10 sm:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left - Text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-surface/90 text-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-5">
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                Para vendedores do Mercado Livre
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 sm:mb-5 leading-tight">
                Imprima etiquetas do <span className="text-primary">Mercado Livre</span> em segundos
              </h1>

              <p className="text-base sm:text-lg text-foreground/70 mb-6 sm:mb-8 leading-relaxed">
                Acelere seu processo de envio com impressão direta em formato ZPL.
                Sem complicação, sem perda de tempo.
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-5">
                <Button
                  size="xl"
                  onClick={handleCTA}
                  className="shadow-lg shadow-foreground/10"
                >
                  Começar Agora
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <div className="text-left">
                  <div className="text-xl sm:text-2xl font-bold text-foreground">
                    {proPrice !== null ? `R$ ${formatBRL(proPrice)}` : 'R$ 59,90'}
                  </div>
                  <div className="text-foreground/60 text-xs sm:text-sm">por mês</div>
                </div>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-6 mt-6 sm:mt-8 text-xs sm:text-sm text-foreground/70">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-success" />
                  Impressões ilimitadas
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-success" />
                  Cancele quando quiser
                </div>
              </div>
            </div>

            {/* Right - Demo */}
            <div className="relative hidden md:block">
              <div className="absolute -inset-4 bg-white/50 rounded-3xl blur-2xl"></div>
              <div className="relative bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden">
                <div className="bg-muted px-4 py-2.5 flex items-center gap-2 border-b border-border">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="p-5 bg-background">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-foreground" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">15 envios prontos</div>
                        <div className="text-sm text-muted-foreground">Última atualização: agora</div>
                      </div>
                    </div>
                    <Button size="sm" className="pointer-events-none">
                      <Download className="w-4 h-4" />
                      Imprimir Selecionados
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-surface p-3.5 rounded-lg border border-border flex items-center gap-4">
                        <div className="w-5 h-5 border-2 border-primary rounded bg-primary flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">Envio #{4820000 + i}</div>
                          <div className="text-sm text-muted-foreground">Comprador{i} • 2x Produto exemplo</div>
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
      <section className="py-10 sm:py-16 bg-surface">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 sm:mb-4">
              Tudo que você precisa para agilizar seus envios
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
              Desenvolvido por vendedores, para vendedores. Focado em simplicidade e eficiência.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-4 sm:p-6">
                <div className="w-11 h-11 sm:w-14 sm:h-14 bg-secondary/60 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <feature.icon className="w-5 h-5 sm:w-7 sm:h-7 text-foreground" />
                </div>
                <h3 className="text-sm sm:text-lg font-semibold text-foreground mb-1 sm:mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-base text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-10 sm:py-16 bg-muted">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 sm:mb-6">
                Pare de perder tempo com etiquetas
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
                Sabemos como é frustrante o processo manual de impressão de etiquetas.
                Por isso criamos uma solução que funciona direto com sua impressora térmica.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-foreground/80">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface p-5 sm:p-8 rounded-2xl shadow-lg border border-border">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-3xl font-bold text-foreground">5 min</div>
                  <div className="text-muted-foreground">tempo médio economizado por envio</div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">Processo manual</span>
                  <span className="text-red-500 font-medium">~7 minutos</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">Com LabelGo</span>
                  <span className="text-green-500 font-medium">~2 minutos</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-foreground font-medium">50 envios por dia</span>
                  <span className="text-primary font-bold">4+ horas economizadas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing CTA Section */}
      <section className="py-10 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 sm:mb-4">
            Comece a economizar tempo hoje
          </h2>
          <p className="text-muted-foreground mb-8">
            Teste agora e veja a diferença no seu processo de envio.
          </p>

          <div className="bg-primary p-6 sm:p-8 rounded-2xl text-white">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl sm:text-5xl font-bold">
                {proPrice !== null ? `R$ ${formatBRL(proPrice)}` : 'R$ 59,90'}
              </span>
              <span className="text-secondary">/mês</span>
            </div>
            <p className="text-white/80 mb-6">
              Acesso completo • Impressões ilimitadas • Cancele quando quiser
            </p>
            <button
              onClick={handleCTA}
              className="bg-white text-primary px-8 py-4 rounded-xl font-semibold text-lg hover:bg-secondary hover:text-foreground transition-colors"
            >
              Começar Agora
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-white/60 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo variant="light" className="h-10" />
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a href="/pricing" className="hover:text-white transition-colors">Preços</a>
              <a href="/termos" className="hover:text-white transition-colors">Termos de Uso</a>
              <a href="/privacidade" className="hover:text-white transition-colors">Privacidade</a>
            </div>
            <div className="text-sm">
              © {new Date().getFullYear()} LabelGo. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
