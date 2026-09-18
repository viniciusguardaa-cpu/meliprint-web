import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import {
  ArrowLeft, User, Mail, Store, KeyRound, CreditCard,
  Link2, Loader2, MailCheck, ChevronRight, Unlink
} from 'lucide-react';
import Header from '../components/Header';
import MarketplaceLogo from '../components/MarketplaceLogo';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import toast from 'react-hot-toast';

interface ProviderInfo {
  id: string;
  displayName: string;
  configured?: boolean;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, connectAccount, disconnectAccount, checkAuth } = useAuth();
  const { subscription } = useSubscription();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [sendingPasswordEmail, setSendingPasswordEmail] = useState(false);

  const accounts = user?.accounts || [];

  const providerName = (id: string) =>
    providers.find((p) => p.id === id)?.displayName || id;

  // OAuth connect feedback: ?connected=provider / ?error=account_in_use
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      toast.success('Conta conectada com sucesso!');
      checkAuth();
      window.history.replaceState({}, '', '/configuracoes');
    } else if (params.get('error') === 'account_in_use') {
      toast.error('Esta conta do marketplace já está conectada a outro usuário.');
      window.history.replaceState({}, '', '/configuracoes');
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(d.providers || []))
      .catch(() => { });
  }, []);

  const handleConnect = async (providerId: string) => {
    setConnectError(null);
    setConnecting(providerId);
    try {
      await connectAccount(providerId, '/configuracoes');
    } catch (err) {
      setConnectError(err instanceof Error && err.message
        ? err.message
        : 'Não foi possível iniciar a conexão. Tente novamente.');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: number, label: string) => {
    if (!confirm(`Desconectar ${label}?`)) return;
    const ok = await disconnectAccount(accountId);
    if (ok) {
      toast.success('Conta desconectada.');
    } else {
      setConnectError('Não foi possível desconectar. Defina uma senha antes de remover sua última forma de acesso.');
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      const res = await fetch('/api/auth/verify-email/send', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        toast.success('E-mail de verificação enviado!');
      } else {
        toast.error('Não foi possível enviar o e-mail agora.');
      }
    } catch {
      toast.error('Não foi possível enviar o e-mail agora.');
    } finally {
      setResendingVerification(false);
    }
  };

  const handlePasswordEmail = async () => {
    if (!user?.email) return;
    setSendingPasswordEmail(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user.email })
      });
      toast.success('Enviamos um e-mail com o link para definir sua senha.');
    } catch {
      toast.error('Não foi possível enviar o e-mail agora.');
    } finally {
      setSendingPasswordEmail(false);
    }
  };

  const subscriptionLabel = (status?: string | null) => {
    switch (status) {
      case 'authorized':
      case 'active': return 'Ativa';
      case 'trialing': return 'Período de teste';
      case 'cancelled': return 'Cancelada';
      case 'paused':
      case 'pending': return 'Pagamento pendente';
      case 'trial_expired': return 'Teste expirado';
      case 'expired': return 'Expirada';
      default: return 'Sem assinatura';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showDashboard />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Dashboard
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-6">Configurações</h1>

        {/* Perfil */}
        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary" />
            Perfil
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Nome</span>
              <span className="font-medium text-foreground">{user?.nickname || '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">E-mail</span>
              <span className="font-medium text-foreground flex items-center gap-2">
                {user?.email || '-'}
                {user?.email && (
                  user.emailVerified ? (
                    <Badge variant="success">Verificado</Badge>
                  ) : (
                    <Badge variant="warning">Não verificado</Badge>
                  )
                )}
              </span>
            </div>
            {user?.email && !user.emailVerified && (
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MailCheck className="w-4 h-4" />
                  )}
                  Reenviar verificação
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Marketplaces */}
        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-1">
            <Store className="w-5 h-5 text-primary" />
            Marketplaces
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Conecte suas contas de marketplace para o LabelGo buscar os envios prontos para impressão.
          </p>

          {connectError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {connectError}
            </div>
          )}

          <div className="divide-y divide-border">
            {providers.map((p) => {
              const connected = accounts.filter((a) => a.provider === p.id);
              const available = p.configured !== false;
              return (
                <div key={p.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <MarketplaceLogo provider={p.id} size={36} />
                      <div className="min-w-0">
                        <span className="font-medium text-foreground block truncate">{p.displayName}</span>
                        {!available ? (
                          <span className="text-xs text-muted-foreground">Em breve</span>
                        ) : connected.some((a) => a.status === 'reauth_required') ? (
                          <Badge variant="warning">Reconexão necessária</Badge>
                        ) : connected.length ? (
                          <Badge variant="success">Conectado</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Não conectado</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={connected.length ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => handleConnect(p.id)}
                      disabled={connecting === p.id || !available}
                      title={!available ? 'Disponível em breve' : undefined}
                    >
                      {connecting === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      {!available
                        ? 'Em breve'
                        : connected.length ? 'Conectar outra conta' : 'Conectar'}
                    </Button>
                  </div>
                  {connected.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {connected.map((a) => (
                        <li
                          key={a.id}
                          className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${a.status === 'reauth_required' ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-muted'
                            }`}
                        >
                          <span className="text-sm text-foreground min-w-0">
                            {a.nickname || a.externalUserId}
                            <span className="text-muted-foreground"> · ID {a.externalUserId}</span>
                            {a.status === 'reauth_required' && (
                              <Badge variant="warning" className="ml-2">Reconectar</Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {a.status === 'reauth_required' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConnect(a.provider)}
                                disabled={connecting === a.provider}
                                className="border-amber-300 text-amber-800 hover:bg-amber-100"
                              >
                                {connecting === a.provider ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Link2 className="w-4 h-4" />
                                )}
                                Reconectar
                              </Button>
                            )}
                            <button
                              onClick={() => handleDisconnect(a.id, `${providerName(a.provider)} (${a.nickname || a.externalUserId})`)}
                              title="Desconectar conta"
                              className="text-muted-foreground hover:text-danger transition-colors"
                            >
                              <Unlink className="w-4 h-4" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Segurança */}
        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-1">
            <KeyRound className="w-5 h-5 text-primary" />
            Segurança
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Defina ou altere sua senha de acesso. Enviaremos um link para o seu e-mail.
          </p>
          <Button
            variant="outline"
            onClick={handlePasswordEmail}
            disabled={sendingPasswordEmail || !user?.email}
          >
            {sendingPasswordEmail ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Definir / alterar senha
          </Button>
        </section>

        {/* Assinatura */}
        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-1">
            <CreditCard className="w-5 h-5 text-primary" />
            Assinatura
          </h2>
          <button
            onClick={() => navigate('/subscription')}
            className="w-full flex items-center justify-between gap-4 mt-3 bg-muted hover:bg-border/60 rounded-lg px-4 py-3 transition-colors"
          >
            <span className="text-sm text-foreground">
              {subscription?.planName || 'LabelGo'}
              <span className="text-muted-foreground"> · {subscriptionLabel(subscription?.status)}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </section>
      </main>
    </div>
  );
}
