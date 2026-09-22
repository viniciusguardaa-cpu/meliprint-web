import { useEffect, useState } from 'react';
import {
  Users, DollarSign, TrendingDown, RefreshCw, Lock, Gift, Trash2, Plus,
  Activity, Search, Printer, Ban, CheckCircle, X, Clock, Wifi, WifiOff,
  Timer, ChevronRight, AlertTriangle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

interface Subscriber {
  user_id: number;
  ml_user_id: number | null;
  nickname: string;
  email: string | null;
  user_created_at: string;
  blocked_at: string | null;
  trial_started_at: string | null;
  status: string | null;
  plan_id: string | null;
  price: number | null;
  contracted_amount: number | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  subscription_created_at: string | null;
  agent_status: string | null;
  last_heartbeat_at: string | null;
  prints_total: number | null;
  last_print_at: string | null;
  has_free_access: boolean;
}

interface Stats {
  totalUsers: number;
  activeSubscriptions: number;
  mrr: number;
  cancelledSubscriptions: number;
  agentsOnline: number;
  agentsOffline: number;
  mrrByPlan: Array<{ planId: string; planName: string | null; count: number; mrr: number }>;
  trials: { active: number; expired: number; expiring24h: number };
}

interface Timeseries {
  days: number;
  series: Array<{ day: string; signups: number; prints: number; cancellations: number }>;
  totals: {
    prints30d: number;
    signups30d: number;
    cancelled30d: number;
    activeTrials: number;
    trialsTotal: number;
    paidSubs: number;
    convertedFromTrial: number;
    blockedUsers: number;
  };
}

interface UserDetail {
  user: {
    id: number;
    ml_user_id: number | null;
    nickname: string;
    email: string | null;
    email_verified: boolean;
    blocked_at: string | null;
    trial_started_at: string | null;
    created_at: string;
    updated_at: string;
  };
  subscriptions: Array<{
    id: number;
    status: string;
    plan_id: string | null;
    plan_name: string | null;
    price: number | null;
    contracted_amount: number | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    mp_preapproval_id: string | null;
    created_at: string;
  }>;
  accounts: Array<{
    id: number;
    provider: string;
    external_user_id: string;
    nickname: string | null;
    email: string | null;
    status: string;
    created_at: string;
  }>;
  agent: {
    enabled: boolean;
    agent_status: string | null;
    agent_id: string | null;
    printer_name: string | null;
    last_heartbeat_at: string | null;
    last_polled_at: string | null;
  } | null;
  prints: {
    events_total: number;
    browser_prints: number;
    agent_events: number;
    agent_prints: number;
    prints_30d: number;
    last_print_at: string | null;
  };
  queue: {
    pending: number; processing: number; printed: number; failed: number; needs_review: number;
  };
  recentPrints: Array<{ provider: string; shipment_id: string; source: string; created_at: string }>;
  recentJobs: Array<{
    provider: string; shipment_id: string; status: string; attempts: number;
    last_error: string | null; created_at: string; printed_at: string | null;
  }>;
  utm: {
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    referrer: string | null; landing_path: string | null;
  } | null;
}

interface FreeAccessEntry {
  id: number;
  email: string;
  note: string | null;
  created_at: string;
}

interface GrowthMetrics {
  days: number;
  funnel: {
    page_views: number;
    unique_visitors: number;
    landing_visitors: number;
    registered: number;
    oauth_started: number;
    ml_connected: number;
    pricing_visitors: number;
    checkouts_started: number;
    trials_started: number;
    subscriptions_activated: number;
    subscriptions_cancelled: number;
  };
  abandonment: {
    checkout_abandoned: number;
    trials_not_converted: number;
    pricing_no_checkout: number;
  };
  top_pages: Array<{ path: string; views: number; visitors: number }>;
  visitors_by_day: Array<{ day: string; views: number; visitors: number }>;
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

function statusBadge(s: Subscriber) {
  if (s.blocked_at) {
    return <Badge variant="error">Bloqueado</Badge>;
  }
  if (s.has_free_access) {
    return <Badge variant="action">Cortesia</Badge>;
  }
  if (!s.status) {
    return <Badge>Sem assinatura</Badge>;
  }
  if (ACTIVE_STATUSES.includes(s.status)) {
    return <Badge variant="success">Ativa</Badge>;
  }
  if (s.status === 'trialing') {
    return <Badge variant="processing">Trial</Badge>;
  }
  if (s.status === 'cancelled') {
    return <Badge variant="error">Cancelada</Badge>;
  }
  return <Badge variant="warning">{s.status}</Badge>;
}

function subStatusBadge(status: string) {
  if (ACTIVE_STATUSES.includes(status)) return <Badge variant="success">Ativa</Badge>;
  if (status === 'trialing') return <Badge variant="processing">Trial</Badge>;
  if (status === 'cancelled') return <Badge variant="error">Cancelada</Badge>;
  if (status === 'converted') return <Badge variant="action">Convertida</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function timeAgo(dateString: string | null | undefined) {
  if (!dateString) return 'nunca';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return formatDate(dateString);
}

/** Minimal bar chart rendered with divs — no chart dependency. */
function MiniBars({ data, color }: { data: Array<{ label: string; value: number }>; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-[2px] h-24">
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.label}: ${d.value}`}
          className={`flex-1 rounded-t-sm ${color} transition-all`}
          style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 1)}%`, opacity: d.value > 0 ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem('adminKey') || '');
  const [userInput, setUserInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [growthDays, setGrowthDays] = useState(30);
  const [timeseries, setTimeseries] = useState<Timeseries | null>(null);
  const [freeAccess, setFreeAccess] = useState<FreeAccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'trial' | 'cancelled' | 'blocked' | 'none'>('all');
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [grantEmail, setGrantEmail] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const headers = (key: string) => ({ 'x-admin-key': key });

  const fetchData = async (key: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const [statsRes, subsRes, freeRes, growthRes, tsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: headers(key) }),
        fetch('/api/admin/subscribers', { headers: headers(key) }),
        fetch('/api/admin/free-access', { headers: headers(key) }),
        fetch(`/api/admin/growth?days=${growthDays}`, { headers: headers(key) }),
        fetch('/api/admin/timeseries?days=30', { headers: headers(key) })
      ]);

      if ([statsRes, subsRes, freeRes].some((r) => r.status === 401)) {
        setAuthError('Sessão expirada. Entre novamente.');
        localStorage.removeItem('adminKey');
        setAdminKey('');
        return;
      }

      if (!statsRes.ok || !subsRes.ok || !freeRes.ok) {
        throw new Error('Falha ao carregar dados');
      }

      setStats(await statsRes.json());
      setSubscribers((await subsRes.json()).subscribers || []);
      setFreeAccess((await freeRes.json()).freeAccess || []);
      if (growthRes.ok) setGrowth(await growthRes.json());
      if (tsRes.ok) setTimeseries(await tsRes.json());
      localStorage.setItem('adminKey', key);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const changeGrowthDays = async (days: number) => {
    setGrowthDays(days);
    try {
      const res = await fetch(`/api/admin/growth?days=${days}`, { headers: headers(adminKey) });
      if (res.ok) setGrowth(await res.json());
    } catch {
      // keep previous data on failure
    }
  };

  const openDetail = async (userId: number) => {
    setSelectedId(userId);
    setDetail(null);
    setActionMsg(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { headers: headers(adminKey) });
      if (res.ok) {
        setDetail(await res.json());
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setActionMsg(null);
  };

  const userAction = async (userId: number, action: string, body?: object) => {
    setActionBusy(action);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers(adminKey) },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ação falhou');
      setActionMsg(
        action === 'block' ? 'Conta suspensa.'
          : action === 'unblock' ? 'Conta reativada.'
            : `Trial liberado até ${formatDate(data.trialEndsAt)}.`
      );
      await openDetail(userId);
      await fetchData(adminKey);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Ação falhou');
    } finally {
      setActionBusy(null);
    }
  };

  const grantFreeToDetail = async () => {
    if (!detail?.user.email) return;
    setActionBusy('free');
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/free-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers(adminKey) },
        body: JSON.stringify({ email: detail.user.email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao liberar acesso');
      setActionMsg(`Acesso cortesia liberado para ${detail.user.email}.`);
      await openDetail(detail.user.id);
      await fetchData(adminKey);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Erro ao liberar acesso');
    } finally {
      setActionBusy(null);
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

  const handleSubmitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !passInput) return;
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userInput.trim(), password: passInput })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(data.error || 'Erro ao entrar');
        return;
      }
      localStorage.setItem('adminKey', data.token);
      setAdminKey(data.token);
      await fetchData(data.token);
    } catch {
      setAuthError('Erro ao entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const filteredSubscribers = subscribers.filter((s) => {
    if (filter === 'active' && !(s.status !== null && ACTIVE_STATUSES.includes(s.status))) return false;
    if (filter === 'trial' && s.status !== 'trialing') return false;
    if (filter === 'cancelled' && s.status !== 'cancelled') return false;
    if (filter === 'blocked' && !s.blocked_at) return false;
    if (filter === 'none' && s.status !== null) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [s.nickname, s.email, String(s.ml_user_id ?? ''), String(s.user_id)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const trialConversion = timeseries && timeseries.totals.trialsTotal > 0
    ? Math.round((timeseries.totals.convertedFromTrial / timeseries.totals.trialsTotal) * 100)
    : null;

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
            Entre com seu usuário e senha de administrador.
          </p>
          <Input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Usuário"
            autoComplete="username"
            className="w-full mb-3 py-3"
            autoFocus
          />
          <Input
            type="password"
            value={passInput}
            onChange={(e) => setPassInput(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
            className="w-full mb-4 py-3"
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(adminKey)}
              disabled={loading}
              className="bg-muted hover:bg-border text-foreground px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              onClick={() => { localStorage.removeItem('adminKey'); setAdminKey(''); }}
              className="text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {authError && (
          <div className="bg-danger/10 border border-red-200 text-danger px-4 py-3 rounded-lg mb-6 text-sm">
            {authError}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-xl border border-border shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Usuários</p>
              <p className="text-2xl font-bold text-foreground">{stats?.totalUsers ?? '-'}</p>
              {timeseries && <p className="text-xs text-muted-foreground">+{timeseries.totals.signups30d} em 30d</p>}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-success/10 rounded-full flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MRR</p>
              <p className="text-2xl font-bold text-foreground">
                {stats ? formatCurrency(stats.mrr) : '-'}
              </p>
              <p className="text-xs text-muted-foreground">{stats?.activeSubscriptions ?? 0} assinaturas</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Impressões 30d</p>
              <p className="text-2xl font-bold text-foreground">{timeseries?.totals.prints30d ?? '-'}</p>
              <p className="text-xs text-muted-foreground">
                {stats ? `${stats.agentsOnline} agentes on` : ''}
              </p>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-sm p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-danger/10 rounded-full flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5 text-danger" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cancelamentos 30d</p>
              <p className="text-2xl font-bold text-foreground">{timeseries?.totals.cancelled30d ?? '-'}</p>
              <p className="text-xs text-muted-foreground">{stats?.cancelledSubscriptions ?? 0} no total</p>
            </div>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <p className="text-xs text-muted-foreground mb-1">Trials ativos</p>
            <p className="text-xl font-bold text-foreground">{stats?.trials.active ?? '-'}</p>
            {stats && stats.trials.expiring24h > 0 && (
              <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> {stats.trials.expiring24h} expiram em 24h
              </p>
            )}
          </div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <p className="text-xs text-muted-foreground mb-1">Conversão trial → pago</p>
            <p className="text-xl font-bold text-foreground">
              {trialConversion !== null ? `${trialConversion}%` : '-'}
            </p>
            <p className="text-xs text-muted-foreground">{timeseries?.totals.convertedFromTrial ?? 0} convertidos</p>
          </div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <p className="text-xs text-muted-foreground mb-1">Agentes</p>
            <p className="text-xl font-bold text-foreground">
              <span className="text-success">{stats?.agentsOnline ?? 0}</span>
              <span className="text-muted-foreground font-normal text-sm"> / {stats?.agentsOffline ?? 0} off</span>
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <p className="text-xs text-muted-foreground mb-1">Bloqueados</p>
            <p className="text-xl font-bold text-foreground">{timeseries?.totals.blockedUsers ?? 0}</p>
          </div>
        </div>

        {/* Timeseries charts */}
        {timeseries && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Novos usuários / dia (30d)</h3>
              <MiniBars
                color="bg-primary"
                data={timeseries.series.map((d) => ({
                  label: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                  value: d.signups
                }))}
              />
            </div>
            <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Etiquetas impressas / dia (30d)</h3>
              <MiniBars
                color="bg-success"
                data={timeseries.series.map((d) => ({
                  label: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                  value: d.prints
                }))}
              />
            </div>
          </div>
        )}

        {/* MRR by plan */}
        {stats && stats.mrrByPlan.length > 0 && (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
            <h3 className="text-sm font-semibold text-foreground mb-3">MRR por plano</h3>
            <div className="flex flex-wrap gap-3">
              {stats.mrrByPlan.map((p) => (
                <div key={p.planId} className="bg-muted rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground">{p.planName || p.planId}</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(p.mrr)}</p>
                  <p className="text-xs text-muted-foreground">{p.count} assinaturas</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Growth funnel */}
        {growth && (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Analytics</h2>
              </div>
              <div className="flex items-center gap-1">
                {([7, 30, 90, 0] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => changeGrowthDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${growthDays === d ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-border'}`}
                  >
                    {d === 0 ? 'Tudo' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>

            {/* Traffic totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.unique_visitors}</div>
                <div className="text-xs text-muted-foreground">Visitantes únicos</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.page_views}</div>
                <div className="text-xs text-muted-foreground">Páginas vistas</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.registered}</div>
                <div className="text-xs text-muted-foreground">Cadastros</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{growth.funnel.subscriptions_cancelled}</div>
                <div className="text-xs text-muted-foreground">Cancelamentos</div>
              </div>
            </div>

            {/* Funnel with step conversion */}
            <h3 className="text-sm font-semibold text-foreground mb-3">Funil de conversão</h3>
            <div className="space-y-2 mb-6">
              {(() => {
                const f = growth.funnel;
                const steps = [
                  { label: 'Visitaram a landing', value: f.landing_visitors },
                  { label: 'Se cadastraram', value: f.registered },
                  { label: 'Viram a página de preços', value: f.pricing_visitors },
                  { label: 'Iniciaram checkout', value: f.checkouts_started },
                  { label: 'Iniciaram trial', value: f.trials_started },
                  { label: 'Assinaram', value: f.subscriptions_activated },
                ];
                const top = Math.max(steps[0].value, 1);
                return steps.map((s, i) => {
                  const prev = i > 0 ? steps[i - 1].value : s.value;
                  const stepPct = prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  const totalPct = Math.round((s.value / top) * 100);
                  return (
                    <div key={s.label} className="relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/10 rounded-lg transition-all"
                        style={{ width: `${Math.max(totalPct, 2)}%` }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-foreground">{s.label}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          <span className="font-bold text-foreground">{s.value}</span>
                          {i > 0 && stepPct !== null && (
                            <span className={`ml-2 text-xs ${stepPct < 50 ? 'text-danger' : 'text-success'}`}>
                              {stepPct}% do passo anterior
                            </span>
                          )}
                          <span className="ml-2 text-xs">{totalPct}% do topo</span>
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Abandonment */}
            <h3 className="text-sm font-semibold text-foreground mb-3">Abandono</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.pricing_no_checkout}</div>
                <div className="text-xs text-muted-foreground">Viram preços e não iniciaram checkout</div>
              </div>
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.checkout_abandoned}</div>
                <div className="text-xs text-muted-foreground">Iniciaram checkout e não assinaram</div>
              </div>
              <div className="bg-danger/10 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-danger">{growth.abandonment.trials_not_converted}</div>
                <div className="text-xs text-muted-foreground">Trials que não viraram assinatura</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Visitors per day */}
              {growth.visitors_by_day.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Visitantes únicos / dia</h3>
                  <MiniBars
                    color="bg-primary"
                    data={growth.visitors_by_day.map((d) => ({
                      label: `${new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${d.visitors} visitantes, ${d.views} views`,
                      value: d.visitors
                    }))}
                  />
                </div>
              )}

              {/* Top pages */}
              {growth.top_pages.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Páginas mais acessadas</h3>
                  <div className="divide-y divide-border">
                    {growth.top_pages.map((p) => (
                      <div key={p.path} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-foreground truncate font-mono text-xs">{p.path}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-3">
                          {p.views} views · {p.visitors} únicos
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

        {/* Search + filter tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou ID..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ['all', 'Todos'],
              ['active', 'Ativos'],
              ['trial', 'Em trial'],
              ['cancelled', 'Cancelados'],
              ['blocked', 'Bloqueados'],
              ['none', 'Sem assinatura'],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-surface text-muted-foreground hover:bg-muted border border-border'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Subscribers table */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Plano</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Impressões</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Agente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente desde</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((s) => (
                    <tr
                      key={s.user_id}
                      onClick={() => openDetail(s.user_id)}
                      className="hover:bg-secondary/10 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{s.nickname}</p>
                        <p className="text-xs text-muted-foreground">{s.email || `ML #${s.ml_user_id ?? s.user_id}`}</p>
                      </td>
                      <td className="px-4 py-4">{statusBadge(s)}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {s.plan_id || '-'}
                        {s.contracted_amount != null && (
                          <span className="block text-xs">{formatCurrency(s.contracted_amount)}/mês</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {Number(s.prints_total ?? 0)}
                        {s.last_print_at && (
                          <span className="block text-xs">última {timeAgo(s.last_print_at)}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {s.agent_status === 'online' ? (
                          <span className="inline-flex items-center gap-1 text-success text-sm">
                            <Wifi className="w-4 h-4" /> on
                          </span>
                        ) : s.agent_status ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                            <WifiOff className="w-4 h-4" /> off
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{formatDate(s.user_created_at)}</td>
                      <td className="px-4 py-4 text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Client detail drawer */}
      {selectedId !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative bg-surface w-full max-w-lg h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-foreground">
                {detail ? detail.user.nickname : 'Cliente'}
              </h2>
              <button onClick={closeDetail} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="flex items-center justify-center py-24">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Identity */}
                <section>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-foreground">{detail.user.nickname}</p>
                      <p className="text-sm text-muted-foreground">{detail.user.email || 'sem email'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ID {detail.user.id}
                        {detail.user.ml_user_id && ` · ML ${detail.user.ml_user_id}`}
                        {' · desde '}{formatDate(detail.user.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {detail.user.blocked_at && <Badge variant="error">Bloqueado</Badge>}
                      {!detail.user.email_verified && detail.user.email && (
                        <Badge variant="warning">Email não verificado</Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {detail.user.blocked_at ? (
                      <Button
                        size="sm" variant="secondary" disabled={actionBusy !== null}
                        onClick={() => userAction(detail.user.id, 'unblock')}
                      >
                        <CheckCircle className="w-4 h-4" /> Reativar conta
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="destructiveOutline" disabled={actionBusy !== null}
                        onClick={() => {
                          if (window.confirm(`Suspender ${detail.user.nickname}? O acesso e o agente param imediatamente.`)) {
                            userAction(detail.user.id, 'block');
                          }
                        }}
                      >
                        <Ban className="w-4 h-4" /> Suspender
                      </Button>
                    )}
                    {[7, 15, 30].map((d) => (
                      <Button
                        key={d} size="sm" variant="outline" disabled={actionBusy !== null}
                        onClick={() => userAction(detail.user.id, 'extend-trial', { days: d })}
                      >
                        <Timer className="w-4 h-4" /> +{d}d trial
                      </Button>
                    ))}
                    {detail.user.email && (
                      <Button
                        size="sm" variant="outline" disabled={actionBusy !== null}
                        onClick={grantFreeToDetail}
                      >
                        <Gift className="w-4 h-4" /> Cortesia
                      </Button>
                    )}
                  </div>
                  {actionMsg && (
                    <p className="text-sm text-muted-foreground mt-2">{actionMsg}</p>
                  )}
                </section>

                {/* Usage */}
                <section className="bg-muted rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Printer className="w-4 h-4 text-primary" /> Uso
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xl font-bold text-foreground">
                        {Number(detail.prints.events_total) + Number(detail.prints.agent_prints)}
                      </p>
                      <p className="text-xs text-muted-foreground">etiquetas total</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-foreground">{detail.prints.prints_30d}</p>
                      <p className="text-xs text-muted-foreground">últimos 30d</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-foreground">{timeAgo(detail.prints.last_print_at)}</p>
                      <p className="text-xs text-muted-foreground">última impressão</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mt-3 text-center text-xs">
                    <div className="bg-surface rounded-lg py-2">
                      <p className="font-bold text-foreground">{detail.prints.browser_prints}</p>
                      <p className="text-muted-foreground">navegador</p>
                    </div>
                    <div className="bg-surface rounded-lg py-2">
                      <p className="font-bold text-foreground">{detail.queue.pending}</p>
                      <p className="text-muted-foreground">pendentes</p>
                    </div>
                    <div className="bg-surface rounded-lg py-2">
                      <p className="font-bold text-foreground">{detail.queue.printed}</p>
                      <p className="text-muted-foreground">fila imp.</p>
                    </div>
                    <div className="bg-surface rounded-lg py-2">
                      <p className="font-bold text-danger">{detail.queue.failed}</p>
                      <p className="text-muted-foreground">falhas</p>
                    </div>
                    <div className="bg-surface rounded-lg py-2">
                      <p className="font-bold text-amber-700">{detail.queue.needs_review}</p>
                      <p className="text-muted-foreground">revisão</p>
                    </div>
                  </div>
                </section>

                {/* Agent */}
                <section className="bg-muted rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    {detail.agent?.agent_status === 'online'
                      ? <Wifi className="w-4 h-4 text-success" />
                      : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    Agente
                  </h3>
                  {detail.agent ? (
                    <div className="text-sm space-y-1">
                      <p className="text-foreground">
                        Status: <span className="font-medium">{detail.agent.agent_status || 'offline'}</span>
                        {' · '}auto-print {detail.agent.enabled ? 'ativado' : 'desativado'}
                      </p>
                      {detail.agent.printer_name && (
                        <p className="text-muted-foreground">Impressora: {detail.agent.printer_name}</p>
                      )}
                      <p className="text-muted-foreground">
                        Heartbeat: {timeAgo(detail.agent.last_heartbeat_at)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Agente nunca configurado.</p>
                  )}
                </section>

                {/* Subscriptions */}
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" /> Assinaturas
                  </h3>
                  {detail.subscriptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma assinatura.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.subscriptions.map((sub) => (
                        <div key={sub.id} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground">
                              {sub.plan_name || sub.plan_id || 'sem plano'}
                            </span>
                            {subStatusBadge(sub.status)}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {sub.contracted_amount != null && <p>Valor: {formatCurrency(sub.contracted_amount)}/mês</p>}
                            {sub.trial_ends_at && <p>Trial até: {formatDateTime(sub.trial_ends_at)}</p>}
                            {sub.current_period_end && <p>Período até: {formatDate(sub.current_period_end)}</p>}
                            <p>Criada em {formatDate(sub.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Marketplace accounts */}
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Contas conectadas
                  </h3>
                  {detail.accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma conta de marketplace.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.accounts.map((a) => (
                        <div key={a.id} className="border border-border rounded-lg p-3 text-sm flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{a.nickname || a.external_user_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {a.provider} · {a.external_user_id}
                              {a.email && ` · ${a.email}`}
                            </p>
                          </div>
                          <Badge variant={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* UTM */}
                {detail.utm && (
                  <section>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Origem</h3>
                    <p className="text-sm text-muted-foreground">
                      {[detail.utm.utm_source, detail.utm.utm_medium, detail.utm.utm_campaign]
                        .filter(Boolean).join(' / ') || detail.utm.referrer || '(direto)'}
                      {detail.utm.landing_path && ` · entrou em ${detail.utm.landing_path}`}
                    </p>
                  </section>
                )}

                {/* Recent activity */}
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Atividade recente
                  </h3>
                  {detail.recentPrints.length === 0 && detail.recentJobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem atividade de impressão.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.recentPrints.slice(0, 8).map((p, i) => (
                        <div key={`p${i}`} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                          <span className="text-foreground">Envio {p.shipment_id}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.source} · {formatDateTime(p.created_at)}
                          </span>
                        </div>
                      ))}
                      {detail.recentJobs.filter((j) => j.status !== 'printed').slice(0, 5).map((j, i) => (
                        <div key={`j${i}`} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                          <span className="text-foreground flex items-center gap-2">
                            Envio {j.shipment_id}
                            {j.status === 'failed' && <Badge variant="error">falhou</Badge>}
                            {j.status === 'needs_review' && <Badge variant="warning">revisão</Badge>}
                            {j.status === 'pending' && <Badge variant="neutral">pendente</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(j.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
