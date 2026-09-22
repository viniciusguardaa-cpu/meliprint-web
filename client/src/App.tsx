import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Pricing from './pages/Pricing';
import Landing from './pages/Landing';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ZplToPdf from './pages/ZplToPdf';
import SeoPage from './pages/SeoPage';
import { SEO_PAGES } from './content/seoPages';
import NotFound from './pages/NotFound';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';

// Authenticated app pages are code-split: they're never prerendered and keep
// the public landing bundle lean.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PrintLabels = lazy(() => import('./pages/PrintLabels'));
const AutoPrint = lazy(() => import('./pages/AutoPrint'));
const SubscriptionCallback = lazy(() => import('./pages/SubscriptionCallback'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));

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

function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
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

        {/* SEO pages — conteúdo em src/content/seoPages.ts (também usado nos meta/JSON-LD) */}
        <Route path="/converter-zpl-pdf" element={<ZplToPdf />} />
        <Route path="/imprimir-zpl" element={<SeoPage {...SEO_PAGES['/imprimir-zpl']} />} />
        <Route path="/etiqueta-mercado-livre" element={<SeoPage {...SEO_PAGES['/etiqueta-mercado-livre']} />} />
        <Route path="/imprimir-etiqueta-mercado-livre" element={<SeoPage {...SEO_PAGES['/imprimir-etiqueta-mercado-livre']} />} />
        <Route path="/etiqueta-10x15" element={<SeoPage {...SEO_PAGES['/etiqueta-10x15']} />} />
        <Route path="/impressora-termica-mercado-livre" element={<SeoPage {...SEO_PAGES['/impressora-termica-mercado-livre']} />} />
        <Route path="/reimprimir-etiqueta-mercado-livre" element={<SeoPage {...SEO_PAGES['/reimprimir-etiqueta-mercado-livre']} />} />
        <Route path="/imprimir-etiquetas-em-lote" element={<SeoPage {...SEO_PAGES['/imprimir-etiquetas-em-lote']} />} />
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
    </Suspense>
  );
}

export default App;
