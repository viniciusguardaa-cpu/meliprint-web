import { useNavigate } from 'react-router-dom';
import { PackageX } from 'lucide-react';
import { Button } from '../components/ui/button';
import Logo from '../components/Logo';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <Logo className="h-12 mx-auto mb-10" />
        <div className="w-16 h-16 bg-secondary/60 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <PackageX className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-3">
          404 — página não encontrada
        </h1>
        <p className="text-muted-foreground mb-8">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="lg" onClick={() => navigate('/')}>
            Ir para o início
          </Button>
          <Button size="lg" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
