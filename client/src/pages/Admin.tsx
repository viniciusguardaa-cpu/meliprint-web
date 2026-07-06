import { useEffect, useState } from 'react';
import { Users, DollarSign, TrendingDown, RefreshCw, Lock, Gift, Trash2, Plus } from 'lucide-react';

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

const ACTIVE_STATUSES = ['authorized', 'active'];

function statusBadge(status: string | null) {
  if (!status) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Sem assinatura</span>;
  }
  if (ACTIVE_STATUSES.includes(status)) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativa</span>;
  }
  if (status === 'cancelled') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Cancelada</span>;
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{status}</span>;
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

      const [statsRes, subsRes, freeRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/subscribers', { headers }),
        fetch('/api/admin/free-access', { headers })
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmitKey}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full"
        >
          <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-brand-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Acesso restrito</h1>
          <p className="text-gray-500 text-sm text-center mb-6">
            Informe a chave de administrador para ver seus clientes.
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Chave de admin"
            className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            autoFocus
          />
          {authError && (
            <p className="text-red-600 text-sm mb-4 text-center">{authError}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-500 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-white font-bold text-lg">Printly Admin</h1>
          <button
            onClick={() => fetchData(adminKey)}
            disabled={loading}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {authError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {authError}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total de usuários</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalUsers ?? '-'}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">MRR (assinaturas ativas)</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats ? formatCurrency(stats.mrr) : '-'}
              </p>
              <p className="text-xs text-gray-400">{stats?.activeSubscriptions ?? 0} ativas</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Canceladas</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.cancelledSubscriptions ?? '-'}</p>
            </div>
          </div>
        </div>

        {/* Free access section */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-5 h-5 text-brand-500" />
            <h2 className="text-lg font-bold text-gray-900">Liberar empresa sem cobrança</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            O email informado deve ser o mesmo cadastrado na conta do Mercado Livre da empresa.
            Assim que ela fizer login, terá acesso total sem precisar pagar.
          </p>

          <form onSubmit={handleGrantAccess} className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="email"
              required
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              placeholder="Observação (opcional)"
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={granting}
              className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Liberar
            </button>
          </form>

          {grantError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">
              {grantError}
            </div>
          )}

          {freeAccess.length > 0 && (
            <div className="divide-y divide-gray-100 border-t">
              {freeAccess.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{entry.email}</p>
                    {entry.note && <p className="text-xs text-gray-500">{entry.note}</p>}
                  </div>
                  <button
                    onClick={() => handleRevokeAccess(entry.id)}
                    className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
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
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : f === 'cancelled' ? 'Cancelados' : 'Sem assinatura'}
            </button>
          ))}
        </div>

        {/* Subscribers table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Preço</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Próx. cobrança</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((s) => (
                    <tr key={s.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 font-medium text-gray-800">{s.nickname}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{s.email || '-'}</td>
                      <td className="px-4 py-4">{statusBadge(s.status)}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatCurrency(s.price)}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatDate(s.current_period_end)}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatDate(s.user_created_at)}</td>
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
