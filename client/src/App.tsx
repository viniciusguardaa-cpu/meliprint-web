import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Dashboard from './pages/Dashboard';
import PrintLabels from './pages/PrintLabels';
import AutoPrint from './pages/AutoPrint';
import Pricing from './pages/Pricing';
import SubscriptionCallback from './pages/SubscriptionCallback';
import Subscription from './pages/Subscription';
import Settings from './pages/Settings';
import Landing from './pages/Landing';
import Admin from './pages/Admin';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ZplToPdf from './pages/ZplToPdf';
import SeoPage from './pages/SeoPage';
import NotFound from './pages/NotFound';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';

function BlockedScreen() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-surface rounded-2xl border border-border shadow-lg p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">Conta suspensa</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Sua conta foi suspensa. Entre em contato com o suporte para mais informações.
        </p>
        <button
          onClick={logout}
          className="text-primary text-sm font-medium hover:underline"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.blocked) {
    return <BlockedScreen />;
  }

  return <>{children}</>;
}

function SubscriberRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.blocked) {
    return <BlockedScreen />;
  }

  if (!isActive) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="/verificar-email" element={<VerifyEmail />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/termos" element={<Terms />} />
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* SEO pages */}
      <Route path="/converter-zpl-pdf" element={<ZplToPdf />} />
      <Route path="/imprimir-zpl" element={
        <SeoPage
          title="Imprimir ZPL - LabelGo"
          description="Como imprimir etiquetas ZPL do Mercado Livre em qualquer impressora."
          h1="Imprimir ZPL: guia completo para vendedores"
          sections={[
            { heading: 'O que é ZPL?', body: 'ZPL (Zebra Programming Language) é a linguagem de impressoras térmicas Zebra. Etiquetas do Mercado Livre usam ZPL2 para impressão em impressoras térmicas.' },
            { heading: 'Como imprimir ZPL sem impressora térmica', body: 'Use o conversor gratuito do LabelGo para transformar ZPL em PDF. Depois imprima o PDF em qualquer impressora comum. Acesse /converter-zpl-pdf.' },
            { heading: 'Impressora térmica para Mercado Livre', body: 'As impressoras térmicas mais usadas para etiquetas do Mercado Livre são Zebra GC420t, Zebra ZD420, Bixolon e Elgin. Suportam etiquetas 10x15cm.' },
          ]}
        />
      } />
      <Route path="/etiqueta-mercado-livre" element={
        <SeoPage
          title="Etiqueta Mercado Livre - LabelGo"
          description="Como gerar e imprimir etiquetas do Mercado Livre."
          h1="Etiqueta do Mercado Livre: gerar e imprimir"
          sections={[
            { heading: 'Como gerar etiquetas do Mercado Livre', body: 'Após uma venda, acesse a seção de envios no painel do vendedor. O status deve estar "pronto para enviar" para que a etiqueta esteja disponível.' },
            { heading: 'Formatos disponíveis', body: 'O Mercado Livre oferece etiquetas em PDF (impressora comum) e ZPL2 (impressora térmica). O LabelGo automatiza esse processo conectando sua conta.' },
            { heading: 'Automatize com LabelGo', body: 'No plano Pro, com o agente opcional instalado, quando uma venda cai a etiqueta é gerada e enviada automaticamente para sua impressora. Sem intervenção manual.' },
          ]}
        />
      } />
      <Route path="/imprimir-etiqueta-mercado-livre" element={
        <SeoPage
          title="Imprimir Etiqueta Mercado Livre - LabelGo"
          description="Passo a passo para imprimir etiquetas do Mercado Livre."
          h1="Imprimir etiqueta do Mercado Livre: passo a passo"
          sections={[
            { heading: 'Passo 1: Conectar conta', body: 'Conecte sua conta do Mercado Livre ao LabelGo via OAuth. Isso permite buscar envios e gerar etiquetas automaticamente.' },
            { heading: 'Passo 2: Visualizar envios', body: 'O LabelGo mostra todos os envios prontos para impressão, separados entre "prontos para imprimir" e "reimpressão".' },
            { heading: 'Passo 3: Imprimir', body: 'Escolha PDF (impressora comum) ou ZPL (impressora térmica) e imprima pelo navegador, sem instalar nada. No Pro, a impressão pode ser automática com o agente opcional.' },
          ]}
        />
      } />
      <Route path="/etiqueta-10x15" element={
        <SeoPage
          title="Etiqueta 10x15 - LabelGo"
          description="Etiqueta 10x15cm para Mercado Livre: formato e impressão."
          h1="Etiqueta 10x15: formato padrão do Mercado Livre"
          sections={[
            { heading: 'O que é etiqueta 10x15?', body: 'A etiqueta 10x15cm (100x150mm) é o formato padrão de envio do Mercado Livre no Brasil. Usada em todas as etiquetas pré-pagas.' },
            { heading: 'Impressora térmica para 10x15', body: 'Impressoras Zebra GC420t, ZD420 e Elgin i9 suportam etiquetas 10x15cm. Configure a largura para 100mm.' },
            { heading: 'Imprimir 10x15 sem térmica', body: 'O LabelGo converte ZPL2 para PDF, permitindo imprimir etiquetas 10x15 em impressora comum (A4). Use o conversor gratuito.' },
          ]}
        />
      } />
      <Route path="/impressora-termica-mercado-livre" element={
        <SeoPage
          title="Impressora Térmica Mercado Livre - LabelGo"
          description="Qual impressora térmica usar para etiquetas do Mercado Livre."
          h1="Impressora térmica para Mercado Livre: qual escolher"
          sections={[
            { heading: 'Modelos recomendados', body: 'Zebra GC420t (entrada), Zebra ZD420 (intermediária), Bixolon SLP-DL420, Elgin i9. Todas suportam ZPL2 e etiquetas 10x15cm.' },
            { heading: 'Conectando ao LabelGo', body: 'Pelo navegador, o LabelGo imprime ZPL em qualquer térmica — sem instalar nada. No Pro, o agente opcional detecta a impressora via USB e envia direto, sem diálogo.' },
            { heading: 'Impressão automática', body: 'Com o LabelGo Pro e o agente opcional instalado, a impressora térmica imprime etiquetas automaticamente quando uma venda é confirmada no Mercado Livre.' },
          ]}
        />
      } />
      <Route
        path="/subscription/callback"
        element={
          <ProtectedRoute>
            <SubscriptionCallback />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscription"
        element={
          <ProtectedRoute>
            <Subscription />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <SubscriberRoute>
            <Dashboard />
          </SubscriberRoute>
        }
      />
      <Route
        path="/print/labels"
        element={
          <SubscriberRoute>
            <PrintLabels />
          </SubscriberRoute>
        }
      />
      <Route
        path="/auto-print"
        element={
          <SubscriberRoute>
            <AutoPrint />
          </SubscriberRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
