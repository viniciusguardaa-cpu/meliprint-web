import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Printer, LogOut, RefreshCw, CheckSquare, Square, Package } from 'lucide-react';

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
  const [ready, setReady] = useState<Shipment[]>([]);
  const [reprint, setReprint] = useState<Shipment[]>([]);
  const [tab, setTab] = useState<'ready' | 'reprint'>('ready');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setReady(data.ready || []);
      setReprint(data.reprint || []);
    } catch (err) {
      setError('Erro ao carregar envios. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  const visibleShipments = tab === 'ready' ? ready : reprint;
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Popup blocked');
    }

    const idsJson = JSON.stringify(shipmentIds);
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Etiquetas</title>
    <style>
      html, body { height: 100%; margin: 0; }
      #frame { width: 100%; height: 100vh; border: 0; }
      #status { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 12px; }
      @media print { #status { display: none; } }
    </style>
  </head>
  <body>
    <div id="status">Carregando etiquetas...</div>
    <iframe id="frame"></iframe>
    <script>
      (async function () {
        try {
          const shipmentIds = ${idsJson};
          const res = await fetch('/api/labels/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ shipmentIds })
          });
          if (!res.ok) {
            document.getElementById('status').textContent = 'Erro ao carregar etiquetas.';
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const frame = document.getElementById('frame');
          frame.onload = function () {
            try {
              frame.contentWindow && frame.contentWindow.focus();
              frame.contentWindow && frame.contentWindow.print();
            } catch (e) {
              window.focus();
              window.print();
            }
          };
          frame.src = url;
          document.getElementById('status').textContent = 'Abrindo impressão...';
        } catch (e) {
          document.getElementById('status').textContent = 'Erro ao carregar etiquetas.';
        }
      })();
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintAll = async () => {
    if (selected.size === 0) return;

    setPrinting(true);

    try {
      const shipmentIds = Array.from(selected);

      // 1. Baixar etiquetas ZPL
      openLabelsPrintWindow(shipmentIds);

      // 2. Baixar NFs
      const nfRes = await fetch('/api/labels/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shipmentIds })
      });

      if (nfRes.ok) {
        const data = await nfRes.json();
        for (const item of data.invoices) {
          if (item.invoice?.fiscal_document?.pdf_url) {
            window.open(item.invoice.fiscal_document.pdf_url, '_blank');
          }
        }
      }

      setSelected(new Set());
      fetchShipments();
    } catch (err) {
      if (err instanceof Error && err.message === 'Popup blocked') {
        setError('Permita popups no navegador para abrir a tela de impressão.');
      } else {
        setError('Erro ao imprimir. Tente novamente.');
      }
      console.error(err);
    } finally {
      setPrinting(false);
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
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {printing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Printer className="w-5 h-5" />
            )}
            Imprimir ({selected.size})
          </button>
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
        ) : visibleShipments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-16 text-center">
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
