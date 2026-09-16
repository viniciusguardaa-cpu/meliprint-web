import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PrintLabels from './pages/PrintLabels';
import AutoPrint from './pages/AutoPrint';
import Pricing from './pages/Pricing';
import SubscriptionCallback from './pages/SubscriptionCallback';
import Subscription from './pages/Subscription';
import Landing from './pages/Landing';
import Admin from './pages/Admin';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ZplToPdf from './pages/ZplToPdf';
import SeoPage from './pages/SeoPage';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function SubscriberRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
      <Route path="/admin" element={<Admin />} />
      <Route path="/termos" element={<Terms />} />
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* SEO pages */}
      <Route path="/converter-zpl-pdf" element={<ZplToPdf />} />
      <Route path="/imprimir-zpl" element={
        <SeoPage
          title="Imprimir ZPL - Printly"
          description="Como imprimir etiquetas ZPL do Mercado Livre em qualquer impressora."
          h1="Imprimir ZPL: guia completo para vendedores"
          sections={[
            { heading: 'O que é ZPL?', body: 'ZPL (Zebra Programming Language) é a linguagem de impressoras térmicas Zebra. Etiquetas do Mercado Livre usam ZPL2 para impressão em impressoras térmicas.' },
            { heading: 'Como imprimir ZPL sem impressora térmica', body: 'Use o conversor gratuito do Printly para transformar ZPL em PDF. Depois imprima o PDF em qualquer impressora comum. Acesse /converter-zpl-pdf.' },
            { heading: 'Impressora térmica para Mercado Livre', body: 'As impressoras térmicas mais usadas para etiquetas do Mercado Livre são Zebra GC420t, Zebra ZD420, Bixolon e Elgin. Suportam etiquetas 10x15cm.' },
          ]}
        />
      } />
      <Route path="/etiqueta-mercado-livre" element={
        <SeoPage
          title="Etiqueta Mercado Livre - Printly"
          description="Como gerar e imprimir etiquetas do Mercado Livre."
          h1="Etiqueta do Mercado Livre: gerar e imprimir"
          sections={[
            { heading: 'Como gerar etiquetas do Mercado Livre', body: 'Após uma venda, acesse a seção de envios no painel do vendedor. O status deve estar "pronto para enviar" para que a etiqueta esteja disponível.' },
            { heading: 'Formatos disponíveis', body: 'O Mercado Livre oferece etiquetas em PDF (impressora comum) e ZPL2 (impressora térmica). O Printly automatiza esse processo conectando sua conta.' },
            { heading: 'Automatize com Printly', body: 'Com o Printly Pro, quando uma venda cai, a etiqueta é gerada automaticamente e enviada para sua impressora. Sem intervenção manual.' },
          ]}
        />
      } />
      <Route path="/imprimir-etiqueta-mercado-livre" element={
        <SeoPage
          title="Imprimir Etiqueta Mercado Livre - Printly"
          description="Passo a passo para imprimir etiquetas do Mercado Livre."
          h1="Imprimir etiqueta do Mercado Livre: passo a passo"
          sections={[
            { heading: 'Passo 1: Conectar conta', body: 'Conecte sua conta do Mercado Livre ao Printly via OAuth. Isso permite buscar envios e gerar etiquetas automaticamente.' },
            { heading: 'Passo 2: Visualizar envios', body: 'O Printly mostra todos os envios prontos para impressão, separados entre "prontos para imprimir" e "reimpressão".' },
            { heading: 'Passo 3: Imprimir', body: 'Escolha PDF (impressora comum) ou ZPL (impressora térmica). Com o Printly Pro, a impressão é automática.' },
          ]}
        />
      } />
      <Route path="/etiqueta-10x15" element={
        <SeoPage
          title="Etiqueta 10x15 - Printly"
          description="Etiqueta 10x15cm para Mercado Livre: formato e impressão."
          h1="Etiqueta 10x15: formato padrão do Mercado Livre"
          sections={[
            { heading: 'O que é etiqueta 10x15?', body: 'A etiqueta 10x15cm (100x150mm) é o formato padrão de envio do Mercado Livre no Brasil. Usada em todas as etiquetas pré-pagas.' },
            { heading: 'Impressora térmica para 10x15', body: 'Impressoras Zebra GC420t, ZD420 e Elgin i9 suportam etiquetas 10x15cm. Configure a largura para 100mm.' },
            { heading: 'Imprimir 10x15 sem térmica', body: 'O Printly converte ZPL2 para PDF, permitindo imprimir etiquetas 10x15 em impressora comum (A4). Use o conversor gratuito.' },
          ]}
        />
      } />
      <Route path="/impressora-termica-mercado-livre" element={
        <SeoPage
          title="Impressora Térmica Mercado Livre - Printly"
          description="Qual impressora térmica usar para etiquetas do Mercado Livre."
          h1="Impressora térmica para Mercado Livre: qual escolher"
          sections={[
            { heading: 'Modelos recomendados', body: 'Zebra GC420t (entrada), Zebra ZD420 (intermediária), Bixolon SLP-DL420, Elgin i9. Todas suportam ZPL2 e etiquetas 10x15cm.' },
            { heading: 'Conectando ao Printly', body: 'O Printly Agent detecta impressoras térmicas conectadas via USB e envia ZPL diretamente. Sem drivers complexos.' },
            { heading: 'Impressão automática', body: 'Com o Printly Pro, a impressora térmica imprime etiquetas automaticamente quando uma venda é confirmada no Mercado Livre.' },
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
    </Routes>
  );
}

export default App;
