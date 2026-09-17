import { useEffect, useState } from 'react';
import { Users, DollarSign, TrendingDown, RefreshCw, Lock, Gift, Trash2, Plus, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

interface Subscriber {
  user_id: number;
  ml_user_id: number;
  nickname: string;
  email: string | null;
  user_created_at: string;
  status: string | null;
  plan_id: string | null;
  price: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  subscription_created_at: string | null;
}

interface Stats {
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  cancelledSubscriptions: number;
}

interface FreeAccessEntry {
  id: number;
  email: string;
  note: string | null;
  created_at: string;
}

interface GrowthMetrics {
  funnel: {
    landing_views: number;
    oauth_started: number;
    ml_connected: number;
    pricing_views: number;
    checkouts_started: number;
    trials_started: number;
    subscriptions_activated: number;
    subscriptions_cancelled: number;
  };
  utm_performance: Array<{
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    visitors: number;
    signups: number;
  }>;
  agents: { agents_online: number; agents_offline: number };
  prints: { prints_success: number; prints_failed: number };
}

const ACTIVE_STATUSES = ['authorized', 'active'];

function statusBadge(status: string | null) {
  if (!status) {
    return <Badge>Sem assinatura</Badge>;
  }
  if (ACTIVE_STATUSES.includes(status)) {
    return <Badge variant="success">Ativa</Badge>;
  }
  if (status === 'cancelled') {
    return <Badge variant="error">Cancelada</Badge>;
  }
  return <Badge variant="warning">{status}</Badge>;
}

function formatDate(dateString: string | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-';
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState<string>(() => sessionStorage.getItem('adminKey') || '');
  const [keyInput, setKeyInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [freeAccess, setFreeAccess] = useState<FreeAccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'cancelled' | 'none'>('all');

  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const fetchData = async (key: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const headers = { 'x-admin-key': key };

      const [statsRes, subsRes, freeRes, growthRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/subscribers', { headers }),
        fetch('/api/admin/free-access', { headers }),
        fetch('/api/admin/growth', { headers })
      ]);

      if (statsRes.status === 401 || subsRes.status === 401 || freeRes.status === 401) {
        setAuthError('Chave de admin inválida.');
        sessionStorage.removeItem('adminKey');
        setAdminKey('');
        return;
      }

      if (!statsRes.ok || !subsRes.ok || !freeRes.ok) {
        throw new Error('Falha ao carregar dados');
      }

      const statsData = await statsRes.json();
      const subsData = await subsRes.json();
      const freeData = await freeRes.json();

      setStats(statsData);
      setSubscribers(subsData.subscribers || []);
      setFreeAccess(freeData.freeAccess || []);
      if (growthRes.ok) setGrowth(await growthRes.json());
      sessionStorage.setItem('adminKey', key);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail.trim()) return;

    setGranting(true);
    setGrantError(null);

    try {
      const res = await fetch('/api/admin/free-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ email: grantEmail.trim(), note: grantNote.trim() || undefined })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao liberar acesso');

      setFreeAccess((prev) => [data.entry, ...prev.filter((f) => f.email !== data.entry.email)]);
      setGrantEmail('');
      setGrantNote('');
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Erro ao liberar acesso');
    } finally {
      setGranting(false);
    }
  };

  const handleRevokeAccess = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/free-access/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (!res.ok) throw new Error('Erro ao revogar acesso');
      setFreeAccess((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Erro ao revogar acesso');
    }
  };

  useEffect(() => {
    if (adminKey) fetchData(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setAdminKey(keyInput.trim());
    fetchData(keyInput.trim());
  };

  const filteredSubscribers = subscribers.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'active') return s.status !== null && ACTIVE_STATUSES.includes(s.status);
    if (filter === 'cancelled') return s.status === 'cancelled';
    if (filter === 'none') return s.status === null;
    return true;
  });

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmitKey}
          className="bg-surface rounded-2xl border border-border shadow-lg p-8 max-w-sm w-full"
        >
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2 text-center">Acesso restrito</h1>
          <p className="text-muted-foreground text-sm text-center mb-6">
            Informe a chave de administrador para ver seus clientes.
          </p>
          <Input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Chave de admin"
            className="w-full mb-4 py-3"
            autoFocus
          />
          {authError && (
            <p className="text-danger text-sm mb-4 text-center">{authError}</p>
          )}
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? 'Verificando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-foreground font-bold text-lg">LabelGo Admin</h1>
          <button
            onClick={() => fetchData(adminKey)}
            disabled={loading}
            className="bg-muted hover:bg-border text-foreground px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {authError && (
          <div className="bg-danger/10 border border-red-200 text-danger px-4 py-3 rounded-lg mb-6 text-sm">
            {authError}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de usuários</p>
              <p className="text-2xl font-bold text-foreground">{stats?.totalUsers ?? '-'}</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">MRR (assinaturas ativas)</p>
              <p className="text-2xl font-bold text-foreground">
                {stats ? formatCurrency(stats.mrr) : '-'}
              </p>
              <p className="text-xs text-muted-foreground">{stats?.activeSubscriptions ?? 0} ativas</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-danger/10 rounded-full flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-danger" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Canceladas</p>
              <p className="text-2xl font-bold text-foreground">{stats?.cancelledSubscriptions ?? '-'}</p>
            </div>
          </div>
        </div>

        {/* Growth funnel */}
        {growth && (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Funil de aquisição</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Landing', value: growth.funnel.landing_views },
                { label: 'OAuth iniciado', value: growth.funnel.oauth_started },
                { label: 'ML conectado', value: growth.funnel.ml_connected },
                { label: 'Pricing visto', value: growth.funnel.pricing_views },
                { label: 'Checkout iniciado', value: growth.funnel.checkouts_started },
                { label: 'Trials iniciados', value: growth.funnel.trials_started },
                { label: 'Assinaturas ativas', value: growth.funnel.subscriptions_activated },
                { label: 'Cancelamentos', value: growth.funnel.subscriptions_cancelled },
              ].map((item) => (
                <div key={item.label} className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-foreground">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Agentes e impressões</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-success/10 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-success">{growth.agents.agents_online}</div>
                    <div className="text-xs text-muted-foreground">Agentes online</div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-foreground">{growth.agents.agents_offline}</div>
                    <div className="text-xs text-muted-foreground">Agentes offline</div>
                  </div>
                  <div className="bg-success/10 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-success">{growth.prints.prints_success}</div>
                    <div className="text-xs text-muted-foreground">Etiquetas impressas</div>
                  </div>
                  <div className="bg-danger/10 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-danger">{growth.prints.prints_failed}</div>
                    <div className="text-xs text-muted-foreground">Falhas de impressão</div>
                  </div>
                </div>
              </div>
              {growth.utm_performance.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Origem dos visitantes</h3>
                  <div className="divide-y divide-border border border-border rounded-lg">
                    {growth.utm_performance.map((u, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-foreground truncate">
                          {[u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ') || '(direto)'}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          {u.visitors} visitas · {u.signups} contas
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Free access section */}
        <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Liberar empresa sem cobrança</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            O email informado deve ser o mesmo cadastrado na conta do Mercado Livre da empresa.
            Assim que ela fizer login, terá acesso total sem precisar pagar.
          </p>

          <form onSubmit={handleGrantAccess} className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              type="email"
              required
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="flex-1"
            />
            <Input
              type="text"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              placeholder="Observação (opcional)"
              className="flex-1"
            />
            <Button type="submit" disabled={granting}>
              <Plus className="w-4 h-4" />
              Liberar
            </Button>
          </form>

          {grantError && (
            <div className="bg-danger/10 border border-red-200 text-danger px-4 py-2 rounded-lg mb-4 text-sm">
              {grantError}
            </div>
          )}

          {freeAccess.length > 0 && (
            <div className="divide-y divide-border border-t">
              {freeAccess.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{entry.email}</p>
                    {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                  </div>
                  <button
                    onClick={() => handleRevokeAccess(entry.id)}
                    className="text-red-500 hover:text-danger p-2 rounded-lg hover:bg-danger/10 transition-colors"
                    title="Revogar acesso gratuito"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-4">
          {(['all', 'active', 'cancelled', 'none'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-surface text-muted-foreground hover:bg-muted border border-border'
                }`}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : f === 'cancelled' ? 'Cancelados' : 'Sem assinatura'}
            </button>
          ))}
        </div>

        {/* Subscribers table */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Preço</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Próx. cobrança</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((s) => (
                    <tr key={s.user_id} className="hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-4 font-medium text-foreground">{s.nickname}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{s.email || '-'}</td>
                      <td className="px-4 py-4">{statusBadge(s.status)}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{formatCurrency(s.price)}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{formatDate(s.current_period_end)}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{formatDate(s.user_created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
