import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { Printer, RefreshCw, CheckSquare, Square, Package, Calendar, AlarmClock, ClipboardCheck } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import toast from 'react-hot-toast';

interface OrderItem {
  title: string;
  quantity: number;
  sku?: string;
}

interface Shipment {
  /** marketplace_accounts.id this shipment belongs to. */
  accountId: number;
  marketplace: string;
  /** External shipment id — string (not all marketplaces use numeric ids). */
  shipmentId: string;
  orderId?: string;
  buyerNickname: string;
  items: string;
  status: string;
  substatus: string;
  canPrint: boolean;
  city?: string;
  state?: string;
  dispatchDeadline?: string;
  orderItems?: OrderItem[];
}

interface PrintEvent {
  id: number;
  provider: string;
  shipment_id: string;
  source: string;
  created_at: string;
}

const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  amazon: 'Amazon'
};

function marketplaceLabel(id: string): string {
  return MARKETPLACE_LABELS[id] || id;
}

/** Selection key — unique across accounts and providers. */
function shipmentKey(s: Pick<Shipment, 'accountId' | 'shipmentId'>): string {
  return `${s.accountId}:${s.shipmentId}`;
}

function formatDateParam(dateStr: string): string {
  return `${dateStr}T00:00:00.000-03:00`;
}

function formatDateParamEnd(dateStr: string): string {
  return `${dateStr}T23:59:59.999-03:00`;
}

interface ProviderInfo {
  id: string;
  displayName: string;
}

export default function Dashboard() {
  const { user, connectAccount, disconnectAccount, checkAuth } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const [ready, setReady] = useState<Shipment[]>([]);
  const [reprint, setReprint] = useState<Shipment[]>([]);
  const [tab, setTab] = useState<'ready' | 'reprint' | 'history'>('ready');
  const [history, setHistory] = useState<PrintEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [packingShipment, setPackingShipment] = useState<Shipment | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);

  const accounts = user?.accounts || [];

  // OAuth connect feedback: ?connected=provider / ?error=account_in_use
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      toast.success('Conta conectada com sucesso!');
      checkAuth();
      window.history.replaceState({}, '', '/dashboard');
    } else if (params.get('error') === 'account_in_use') {
      toast.error('Esta conta do marketplace já está conectada a outro usuário.');
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(d.providers || []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [dateFrom, dateTo]);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', formatDateParam(dateFrom));
      if (dateTo) params.set('date_to', formatDateParamEnd(dateTo));
      const res = await fetch(`/api/shipments?${params.toString()}`, { credentials: 'include' });
      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        if (data?.error === 'subscription_required') {
          navigate('/pricing');
          return;
        }
      }
      if (!res.ok) throw new Error('Falha ao carregar envios');
      const data = await res.json();
      setReady(data.ready || []);
      setReprint(data.reprint || []);
    } catch (err) {
      toast.error('Erro ao carregar envios. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  // Pro print history: lazy-load when the tab is opened.
  useEffect(() => {
    if (tab !== 'history' || !subscription?.printHistory) return;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch('/api/shipments/print-history', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.events || []);
        }
      } catch {
        // non-critical
      } finally {
        setHistoryLoading(false);
      }
    };
    load();
  }, [tab, subscription?.printHistory]);

  const visibleShipments = tab === 'ready' ? ready : tab === 'reprint' ? reprint : [];
  const printableShipments = visibleShipments.filter(s => s.canPrint);
  const allPrintableSelected = printableShipments.length > 0 &&
    printableShipments.every(s => selected.has(shipmentKey(s)));

  // Show the marketplace badge only when the list mixes providers — keeps
  // the single-marketplace UI as clean as before.
  const showMarketplaceBadge = new Set(visibleShipments.map(s => s.marketplace)).size > 1;

  const toggleSelect = (key: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (allPrintableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(printableShipments.map(shipmentKey)));
    }
  };

  const openLabelsPrintWindow = (accountId: number, shipmentIds: string[]) => {
    const ids = shipmentIds.join(',');
    const url = `/print/labels?account_id=${accountId}&shipment_ids=${encodeURIComponent(ids)}`;
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      throw new Error('Popup blocked');
    }
  };

  const printShipments = (shipments: Array<Pick<Shipment, 'accountId' | 'shipmentId'>>) => {
    // 1. Agrupa por conta e abre uma janela de impressão por marketplace
    const byAccount = new Map<number, string[]>();
    for (const s of shipments) {
      const list = byAccount.get(s.accountId) || [];
      list.push(s.shipmentId);
      byAccount.set(s.accountId, list);
    }
    for (const [accountId, ids] of byAccount) {
      openLabelsPrintWindow(accountId, ids);
    }

    // 2. Remover otimisticamente os envios impressos da lista "ready"
    const printed = new Set(shipments.map(shipmentKey));
    setReady(prev => prev.filter(s => !printed.has(shipmentKey(s))));
    setSelected(new Set());

    // 3. Refresh após delay para o marketplace atualizar os status
    setTimeout(() => fetchShipments(), 3000);
  };

  const handlePrintAll = async () => {
    if (selected.size === 0) return;

    setPrinting(true);

    try {
      printShipments(printableShipments.filter(s => selected.has(shipmentKey(s))));
    } catch (err) {
      if (err instanceof Error && err.message === 'Popup blocked') {
        toast.error('Permita popups no navegador para abrir a tela de impressão.');
      } else {
        toast.error('Erro ao imprimir. Tente novamente.');
      }
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  const handlePackingConfirm = () => {
    if (!packingShipment) return;
    try {
      printShipments([packingShipment]);
      setPackingShipment(null);
      toast.success('Separação confirmada — etiqueta enviada para impressão.');
    } catch (err) {
      if (err instanceof Error && err.message === 'Popup blocked') {
        toast.error('Permita popups no navegador para abrir a tela de impressão.');
      } else {
        toast.error('Erro ao imprimir. Tente novamente.');
      }
    }
  };

  // Pro SLA queue: urgency badge for the dispatch deadline (ML "despachar até").
  const deadlineBadge = (deadline?: string) => {
    if (!deadline) return null;
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return null;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86400000);

    let label: string;
    let variant: 'error' | 'warning' | 'processing' | 'neutral';
    if (diffDays < 0 || (diffDays === 0 && date.getTime() < now.getTime())) {
      label = 'Atrasado';
      variant = 'error';
    } else if (diffDays === 0) {
      label = `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      variant = 'warning';
    } else if (diffDays === 1) {
      label = 'Amanhã';
      variant = 'processing';
    } else {
      label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      variant = 'neutral';
    }

    return (
      <Badge variant={variant}>
        <AlarmClock className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const showSla = subscription?.slaQueue === true;
  const showPacking = subscription?.packingCheck === true;

  return (
    <div className="min-h-screen bg-background">
      <Header showSubscription />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Actions Bar */}
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-muted-foreground text-sm">até</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={fetchShipments}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => setTab('ready')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'ready' ? 'bg-surface shadow text-foreground' : 'text-muted-foreground'
                  }`}
              >
                Pronto ({ready.length})
              </button>
              <button
                onClick={() => setTab('reprint')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'reprint' ? 'bg-surface shadow text-foreground' : 'text-muted-foreground'
                  }`}
              >
                Reimpressão ({reprint.length})
              </button>
              {subscription?.printHistory && (
                <button
                  onClick={() => setTab('history')}
                  className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'history' ? 'bg-surface shadow text-foreground' : 'text-muted-foreground'
                    }`}
                >
                  Histórico
                </button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={toggleSelectAll}
              disabled={printableShipments.length === 0}
            >
              {allPrintableSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {allPrintableSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
          </div>
          <Button
            size="lg"
            onClick={handlePrintAll}
            disabled={selected.size === 0 || printing}
          >
            {printing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Printer className="w-5 h-5" />
            )}
            Imprimir ({selected.size})
          </Button>
        </div>

        {/* Connected marketplace accounts */}
        {accounts.length === 0 ? (
          <div className="bg-surface rounded-xl border border-dashed border-border shadow-sm p-8 mb-6 text-center">
            <Package className="w-12 h-12 text-border mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Conecte um marketplace para começar
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              O LabelGo busca os envios prontos para impressão nas suas contas conectadas.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {providers.map((p) => (
                <Button key={p.id} onClick={() => connectAccount(p.id)}>
                  Conectar {p.displayName}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border shadow-sm px-4 py-3 mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Contas</span>
            {accounts.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 bg-muted rounded-full pl-3 pr-1.5 py-1 text-sm text-foreground"
              >
                {marketplaceLabel(a.provider)}{a.nickname ? ` · ${a.nickname}` : ''}
                <button
                  onClick={async () => {
                    if (confirm(`Desconectar ${marketplaceLabel(a.provider)} (${a.nickname || a.externalUserId})?`)) {
                      const ok = await disconnectAccount(a.id);
                      if (!ok) setConnectError('Não foi possível desconectar. Defina uma senha antes de remover sua última forma de acesso.');
                    }
                  }}
                  title="Desconectar conta"
                  className="w-5 h-5 rounded-full text-muted-foreground hover:bg-border hover:text-foreground flex items-center justify-center text-xs leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            {providers
              .filter((p) => !accounts.some((a) => a.provider === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => connectAccount(p.id)}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  + Conectar {p.displayName}
                </button>
              ))}
          </div>
        )}
        {connectError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {connectError}
          </div>
        )}

        {/* Shipments List */}
        {tab === 'history' ? (
          historyLoading ? (
            <div className="bg-surface rounded-xl border border-border shadow-sm p-16 text-center text-muted-foreground">
              Carregando histórico...
            </div>
          ) : history.length === 0 ? (
            <div className="bg-surface rounded-xl border border-border shadow-sm p-16 text-center animate-fade-in">
              <Package className="w-16 h-16 text-border mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-muted-foreground mb-2">
                Nenhuma impressão registrada
              </h3>
              <p className="text-muted-foreground/70">
                As etiquetas impressas pelo navegador aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Envio</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Origem</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Impresso em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((event) => (
                      <tr key={event.id}>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm text-muted-foreground">#{event.shipment_id}</span>
                          {event.provider && event.provider !== 'mercadolivre' && (
                            <span className="ml-2 text-xs text-muted-foreground/70">{marketplaceLabel(event.provider)}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">
                          {event.source === 'agent' ? 'Agente' : 'Navegador'}
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">
                          {new Date(event.created_at).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : loading ? (
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-fade-in">
            <div className="bg-muted border-b border-border px-4 py-3 flex gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-4 bg-border rounded w-20 animate-pulse" />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-border">
                <div className="w-5 h-5 bg-border rounded animate-pulse" />
                <div className="h-4 bg-border rounded w-24 animate-pulse" />
                <div className="h-4 bg-border rounded w-32 animate-pulse" />
                <div className="h-4 bg-border rounded w-40 animate-pulse flex-1" />
                <div className="h-4 bg-border rounded w-28 animate-pulse" />
                <div className="h-5 bg-border rounded-full w-16 animate-pulse" />
              </div>
            ))}
          </div>
        ) : visibleShipments.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-16 text-center animate-fade-in">
            <Package className="w-16 h-16 text-border mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground mb-2">
              Nenhum envio encontrado
            </h3>
            <p className="text-muted-foreground/70">
              {tab === 'ready'
                ? 'Não há etiquetas prontas para impressão no momento.'
                : 'Não há etiquetas disponíveis para reimpressão no momento.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Envio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Comprador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Itens</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Destino</th>
                    {showSla && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Prazo</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    {showPacking && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Conferir</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleShipments.map((shipment) => (
                    <tr
                      key={shipmentKey(shipment)}
                      className={`transition-colors ${selected.has(shipmentKey(shipment))
                        ? 'bg-secondary/25 hover:bg-secondary/30'
                        : 'hover:bg-secondary/10'
                        } ${!shipment.canPrint ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleSelect(shipmentKey(shipment))}
                          disabled={!shipment.canPrint}
                          className="disabled:cursor-not-allowed"
                        >
                          {selected.has(shipmentKey(shipment)) ? (
                            <CheckSquare className="w-5 h-5 text-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-border" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-muted-foreground">
                          #{shipment.shipmentId}
                        </span>
                        {showMarketplaceBadge && (
                          <Badge className="ml-2">{marketplaceLabel(shipment.marketplace)}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-4 font-medium text-foreground">
                        {shipment.buyerNickname}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {shipment.items}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {shipment.city && shipment.state
                          ? `${shipment.city}, ${shipment.state}`
                          : '-'}
                      </td>
                      {showSla && (
                        <td className="px-4 py-4">
                          {deadlineBadge(shipment.dispatchDeadline) || (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4">
                        {shipment.canPrint ? (
                          <Badge variant="success">Pronto</Badge>
                        ) : (
                          <Badge>{shipment.substatus || shipment.status}</Badge>
                        )}
                      </td>
                      {showPacking && (
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setPackingShipment(shipment)}
                            disabled={!shipment.canPrint || !shipment.orderItems?.length}
                            title="Conferir itens antes de imprimir"
                            className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ClipboardCheck className="w-5 h-5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Packing check — confirm items before printing (Pro) */}
        {packingShipment && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setPackingShipment(null)}
          >
            <div
              className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-1">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                Conferir envio #{packingShipment.shipmentId}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Confira a separação antes de imprimir — evita pacote errado.
              </p>

              <ul className="divide-y divide-border mb-4 max-h-64 overflow-y-auto">
                {(packingShipment.orderItems || []).map((item, i) => (
                  <li key={i} className="py-2.5 flex items-start gap-3">
                    <span className="flex-shrink-0 bg-secondary/70 text-foreground font-bold text-sm px-2 py-0.5 rounded">
                      {item.quantity}x
                    </span>
                    <div>
                      <div className="text-sm text-foreground">{item.title}</div>
                      {item.sku && (
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {item.sku}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <Button
                  onClick={handlePackingConfirm}
                  className="flex-1"
                >
                  <Printer className="w-4 h-4" />
                  Confirmar e imprimir
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPackingShipment(null)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
