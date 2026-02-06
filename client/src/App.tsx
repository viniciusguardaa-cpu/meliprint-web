import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PrintLabels from './pages/PrintLabels';
import Pricing from './pages/Pricing';
import SubscriptionCallback from './pages/SubscriptionCallback';
import Subscription from './pages/Subscription';
import Landing from './pages/Landing';
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
      <Route path="/pricing" element={<Pricing />} />
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
    </Routes>
  );
}

export default App;
