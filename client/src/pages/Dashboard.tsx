import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { Printer, RefreshCw, CheckSquare, Square, Package, Calendar, AlarmClock, ClipboardCheck } from 'lucide-react';
import Header from '../components/Header';
import toast from 'react-hot-toast';

interface OrderItem {
  title: string;
  quantity: number;
  sku?: string;
}

interface Shipment {
  shipmentId: number;
  orderId: number;
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
  shipment_id: number;
  source: string;
  created_at: string;
}

function formatDateParam(dateStr: string): string {
  return `${dateStr}T00:00:00.000-03:00`;
}

function formatDateParamEnd(dateStr: string): string {
  return `${dateStr}T23:59:59.999-03:00`;
}

export default function Dashboard() {
  useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const [ready, setReady] = useState<Shipment[]>([]);
  const [reprint, setReprint] = useState<Shipment[]>([]);
  const [tab, setTab] = useState<'ready' | 'reprint' | 'history'>('ready');
  const [history, setHistory] = useState<PrintEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [packingShipment, setPackingShipment] = useState<Shipment | null>(null);

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
    printableShipments.every(s => selected.has(s.shipmentId));

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (allPrintableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(printableShipments.map(s => s.shipmentId)));
    }
  };

  const openLabelsPrintWindow = (shipmentIds: number[]) => {
    const ids = shipmentIds.join(',');
    const url = `/print/labels?shipment_ids=${encodeURIComponent(ids)}`;
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      throw new Error('Popup blocked');
    }
  };

  const printShipments = (shipmentIds: number[]) => {
    // 1. Abrir janela de impressão
    openLabelsPrintWindow(shipmentIds);

    // 2. Remover otimisticamente os envios impressos da lista "ready"
    const printed = new Set(shipmentIds);
    setReady(prev => prev.filter(s => !printed.has(s.shipmentId)));
    setSelected(new Set());

    // 3. Refresh após delay para a ML atualizar os status
    setTimeout(() => fetchShipments(), 3000);
  };

  const handlePrintAll = async () => {
    if (selected.size === 0) return;

    setPrinting(true);

    try {
      printShipments(Array.from(selected));
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
      printShipments([packingShipment.shipmentId]);
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
    let cls: string;
    if (diffDays < 0 || (diffDays === 0 && date.getTime() < now.getTime())) {
      label = 'Atrasado';
      cls = 'bg-red-100 text-red-700';
    } else if (diffDays === 0) {
      label = `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      cls = 'bg-amber-100 text-amber-700';
    } else if (diffDays === 1) {
      label = 'Amanhã';
      cls = 'bg-yellow-100 text-yellow-700';
    } else {
      label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      cls = 'bg-gray-100 text-gray-600';
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        <AlarmClock className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const showSla = subscription?.slaQueue === true;
  const showPacking = subscription?.packingCheck === true;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showSubscription />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Actions Bar */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-gray-400 text-sm">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={fetchShipments}
              disabled={loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTab('ready')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'ready' ? 'bg-white shadow text-gray-800' : 'text-gray-600'
                  }`}
              >
                Pronto ({ready.length})
              </button>
              <button
                onClick={() => setTab('reprint')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'reprint' ? 'bg-white shadow text-gray-800' : 'text-gray-600'
                  }`}
              >
                Reimpressão ({reprint.length})
              </button>
              {subscription?.printHistory && (
                <button
                  onClick={() => setTab('history')}
                  className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'history' ? 'bg-white shadow text-gray-800' : 'text-gray-600'
                    }`}
                >
                  Histórico
                </button>
              )}
            </div>
            <button
              onClick={toggleSelectAll}
              disabled={printableShipments.length === 0}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {allPrintableSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {allPrintableSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>
          <button
            onClick={handlePrintAll}
            disabled={selected.size === 0 || printing}
            className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {printing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Printer className="w-5 h-5" />
            )}
            Imprimir ({selected.size})
          </button>
        </div>

        {/* Shipments List */}
        {tab === 'history' ? (
          historyLoading ? (
            <div className="bg-white rounded-xl shadow-md p-16 text-center text-gray-500">
              Carregando histórico...
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-16 text-center animate-fade-in">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Nenhuma impressão registrada
              </h3>
              <p className="text-gray-400">
                As etiquetas impressas pelo navegador aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Envio</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Origem</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Impresso em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((event) => (
                      <tr key={event.id}>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm text-gray-600">#{event.shipment_id}</span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {event.source === 'agent' ? 'Agente' : 'Navegador'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
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
          <div className="bg-white rounded-xl shadow-md overflow-hidden animate-fade-in">
            <div className="bg-gray-50 border-b px-4 py-3 flex gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-gray-100">
                <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-40 animate-pulse flex-1" />
                <div className="h-4 bg-gray-200 rounded w-28 animate-pulse" />
                <div className="h-5 bg-gray-200 rounded-full w-16 animate-pulse" />
              </div>
            ))}
          </div>
        ) : visibleShipments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-16 text-center animate-fade-in">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              Nenhum envio encontrado
            </h3>
            <p className="text-gray-400">
              {tab === 'ready'
                ? 'Não há etiquetas prontas para impressão no momento.'
                : 'Não há etiquetas disponíveis para reimpressão no momento.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Envio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Comprador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Itens</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Destino</th>
                    {showSla && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Prazo</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    {showPacking && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Conferir</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleShipments.map((shipment) => (
                    <tr
                      key={shipment.shipmentId}
                      className={`hover:bg-gray-50 transition-colors ${!shipment.canPrint ? 'opacity-50' : ''
                        }`}
                    >
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleSelect(shipment.shipmentId)}
                          disabled={!shipment.canPrint}
                          className="disabled:cursor-not-allowed"
                        >
                          {selected.has(shipment.shipmentId) ? (
                            <CheckSquare className="w-5 h-5 text-brand-500" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-300" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-gray-600">
                          #{shipment.shipmentId}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-800">
                        {shipment.buyerNickname}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {shipment.items}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {shipment.city && shipment.state
                          ? `${shipment.city}, ${shipment.state}`
                          : '-'}
                      </td>
                      {showSla && (
                        <td className="px-4 py-4">
                          {deadlineBadge(shipment.dispatchDeadline) || (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4">
                        {shipment.canPrint ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Pronto
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {shipment.substatus || shipment.status}
                          </span>
                        )}
                      </td>
                      {showPacking && (
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setPackingShipment(shipment)}
                            disabled={!shipment.canPrint || !shipment.orderItems?.length}
                            title="Conferir itens antes de imprimir"
                            className="text-gray-400 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
                <ClipboardCheck className="w-5 h-5 text-brand-500" />
                Conferir envio #{packingShipment.shipmentId}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Confira a separação antes de imprimir — evita pacote errado.
              </p>

              <ul className="divide-y divide-gray-100 mb-4 max-h-64 overflow-y-auto">
                {(packingShipment.orderItems || []).map((item, i) => (
                  <li key={i} className="py-2.5 flex items-start gap-3">
                    <span className="flex-shrink-0 bg-brand-50 text-brand-700 font-bold text-sm px-2 py-0.5 rounded">
                      {item.quantity}x
                    </span>
                    <div>
                      <div className="text-sm text-gray-800">{item.title}</div>
                      {item.sku && (
                        <div className="text-xs text-gray-400 font-mono mt-0.5">SKU: {item.sku}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <button
                  onClick={handlePackingConfirm}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Confirmar e imprimir
                </button>
                <button
                  onClick={() => setPackingShipment(null)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
