import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogOut, CreditCard, Zap } from 'lucide-react';
import { Button } from './ui/button';
import Logo from './Logo';

interface HeaderProps {
  showSubscription?: boolean;
  showDashboard?: boolean;
}

export default function Header({ showSubscription = false, showDashboard = false }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="bg-surface/80 backdrop-blur-md border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/" className="flex-shrink-0">
          <Logo className="h-9" />
        </a>
        <div className="flex items-center gap-2">
          {user && (
            <span className="text-muted-foreground font-medium text-sm hidden sm:block mr-1">
              {user.nickname}
            </span>
          )}
          {showDashboard && (
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
          )}
          {showSubscription && (
            <Button variant="ghost" onClick={() => navigate('/auto-print')}>
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Auto Print</span>
            </Button>
          )}
          {showSubscription && (
            <Button variant="ghost" onClick={() => navigate('/subscription')}>
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Assinatura</span>
            </Button>
          )}
          {user && (
            <Button variant="outline" onClick={logout}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
