import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogOut, CreditCard } from 'lucide-react';

interface HeaderProps {
  showSubscription?: boolean;
  showDashboard?: boolean;
}

export default function Header({ showSubscription = false, showDashboard = false }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="bg-brand-500 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <a href="/" className="flex-shrink-0">
          <img src="/logo.png" alt="Printly" className="h-10 w-auto" />
        </a>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-white/90 font-medium text-sm hidden sm:block">
              {user.nickname}
            </span>
          )}
          {showDashboard && (
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Dashboard
            </button>
          )}
          {showSubscription && (
            <button
              onClick={() => navigate('/subscription')}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Assinatura</span>
            </button>
          )}
          {user && (
            <button
              onClick={logout}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
