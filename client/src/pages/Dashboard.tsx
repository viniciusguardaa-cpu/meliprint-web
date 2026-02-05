import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Printer, LogOut, RefreshCw, Download, CheckSquare, Square, Package, FileText, Filter } from 'lucide-react';

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
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [downloadingNF, setDownloadingNF] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchShipments();
  }, []);

  const fetchShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shipments', { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar envios');
      const data = await res.json();
      setShipments(data.shipments || []);
    } catch (err) {
      setError('Erro ao carregar envios. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar por status selecionado
  const filteredShipments = shipments.filter(s => {
    if (statusFilter === 'all') return true;
    return s.substatus === statusFilter || s.status === statusFilter;
  });

  // Obter lista única de status para o dropdown
  const uniqueStatuses = [...new Set(shipments.map(s => s.substatus || s.status))];

  const printableShipments = filteredShipments.filter(s => s.canPrint);
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

  const handlePrint = async () => {
    if (selected.size === 0) return;

    setPrinting(true);
    try {
      const res = await fetch('/api/labels/zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shipmentIds: Array.from(selected) })
      });

      if (!res.ok) throw new Error('Falha ao gerar etiquetas');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiquetas-${Date.now()}.zpl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSelected(new Set());
      fetchShipments(); // Recarregar lista após baixar
    } catch (err) {
      setError('Erro ao gerar etiquetas. Tente novamente.');
      console.error(err);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadNF = async () => {
    if (selected.size === 0) return;

    setDownloadingNF(true);
    try {
      const res = await fetch('/api/labels/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shipmentIds: Array.from(selected) })
      });

      if (!res.ok) throw new Error('Falha ao obter NFs');

      const data = await res.json();

      // Abrir links das NFs em novas abas
      for (const item of data.invoices) {
        if (item.invoice?.fiscal_document?.pdf_url) {
          window.open(item.invoice.fiscal_document.pdf_url, '_blank');
        }
      }
    } catch (err) {
      setError('Erro ao baixar NFs. Tente novamente.');
      console.error(err);
    } finally {
      setDownloadingNF(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-yellow-500 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Printer className="w-8 h-8 text-white" />
            <h1 className="text-xl font-bold text-white">MeliPrint Web</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white font-medium">{user?.nickname}</span>
            <button
              onClick={logout}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Actions Bar */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={fetchShipments}
              disabled={loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
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
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg border-0 focus:ring-2 focus:ring-yellow-500"
              >
                <option value="all">Todos os Status</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadNF}
              disabled={selected.size === 0 || downloadingNF}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingNF ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <FileText className="w-4 h-4" />
              )}
              NF
            </button>
            <button
              onClick={handlePrint}
              disabled={selected.size === 0 || printing}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {printing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Download className="w-4 h-4" />
              )}
              Baixar ZPL ({selected.size})
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Shipments List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-16 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              Nenhum envio encontrado
            </h3>
            <p className="text-gray-400">
              Não há envios prontos para impressão no momento.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Envio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Comprador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Itens</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Destino</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredShipments.map((shipment) => (
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
                          <CheckSquare className="w-5 h-5 text-blue-500" />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
