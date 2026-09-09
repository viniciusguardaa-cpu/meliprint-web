import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Printer, Zap, Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import toast from 'react-hot-toast';

interface AutoPrintStatus {
  enabled: boolean;
  agentToken: string | null;
  printerName: string | null;
  lastPolledAt: string | null;
  queue: { pending: number; printed: number; failed: number };
}

export default function AutoPrint() {
  useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<AutoPrintStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [printerName, setPrinterName] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-print/status', { credentials: 'include' });
      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        if (data?.error === 'subscription_required') {
          navigate('/pricing');
          return;
        }
      }
      if (!res.ok) throw new Error('Falha ao carregar status');
      const data = await res.json();
      setStatus(data);
      if (data.printerName) setPrinterName(data.printerName);
    } catch {
      toast.error('Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchStatus();
    // Refresh queue stats every 10s
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const res = await fetch('/api/auto-print/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ printerName: printerName || undefined })
      });
      if (!res.ok) throw new Error('Falha ao ativar');
      const data = await res.json();
      setStatus(prev => ({ ...prev, ...data, queue: prev?.queue || { pending: 0, printed: 0, failed: 0 } }));
      toast.success('Impressão automática ativada!');
    } catch {
      toast.error('Erro ao ativar impressão automática.');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setEnabling(true);
    try {
      const res = await fetch('/api/auto-print/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Falha ao desativar');
      setStatus(prev => prev ? { ...prev, enabled: false } : prev);
      toast.success('Impressão automática desativada.');
    } catch {
      toast.error('Erro ao desativar.');
    } finally {
      setEnabling(false);
    }
  };

  const handleSavePrinter = async () => {
    if (!printerName.trim()) return;
    try {
      const res = await fetch('/api/auto-print/printer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ printerName })
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      toast.success('Impressora salva.');
      fetchStatus();
    } catch {
      toast.error('Erro ao salvar impressora.');
    }
  };

  const copyToken = () => {
    if (!status?.agentToken) return;
    navigator.clipboard.writeText(status.agentToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showSubscription showDashboard />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Zap className="w-6 h-6 text-brand-500" />
            Impressão Automática
          </h1>
          <p className="text-gray-500 mt-1">
            O Meliprint detecta etiquetas liberadas pelo Mercado Livre e imprime automaticamente na sua impressora térmica.
          </p>
        </div>

        {/* Status card */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Status</h2>
              <p className="text-sm text-gray-500 mt-1">
                {enabled
                  ? 'Ativo — o servidor está monitorando novas etiquetas a cada 60s.'
                  : 'Inativo — ative para começar a impressão automática.'}
              </p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {enabled ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          {enabled && status?.queue && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-800">{status.queue.pending}</div>
                <div className="text-xs text-gray-500">Na fila</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{status.queue.printed}</div>
                <div className="text-xs text-gray-500">Impressas</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-700">{status.queue.failed}</div>
                <div className="text-xs text-gray-500">Falhas</div>
              </div>
            </div>
          )}

          {enabled && status?.lastPolledAt && (
            <p className="text-xs text-gray-400 mt-3">
              Última verificação: {new Date(status.lastPolledAt).toLocaleString('pt-BR')}
            </p>
          )}

          <div className="mt-4">
            {enabled ? (
              <button
                onClick={handleDisable}
                disabled={enabling}
                className="bg-red-50 hover:bg-red-100 text-red-700 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {enabling ? 'Desativando...' : 'Desativar'}
              </button>
            ) : (
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {enabling ? 'Ativando...' : 'Ativar Impressão Automática'}
              </button>
            )}
          </div>
        </div>

        {enabled && (
          <>
            {/* Printer name */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <Printer className="w-5 h-5 text-gray-500" />
                Impressora
              </h2>
              <p className="text-sm text-gray-500 mb-3">
                Nome da impressora no CUPS (descubra rodando <code className="bg-gray-100 px-1 rounded">node list-printers.js</code> no agente).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Ex: Zebra_ZD420"
                  className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={handleSavePrinter}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>

            {/* Agent token + setup instructions */}
            {status?.agentToken && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">
                  Token do Agente
                </h2>
                <p className="text-sm text-gray-500 mb-3">
                  Use este token no arquivo <code className="bg-gray-100 px-1 rounded">.env</code> do agente local.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={status.agentToken}
                    className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono"
                  />
                  <button
                    onClick={copyToken}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Como configurar o agente</h3>
                  <ol className="space-y-3 text-sm text-gray-600">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <span>
                        Instale a impressora Zebra no macOS via <strong>System Settings &gt; Printers &amp; Scanners</strong>.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <span>
                        Na pasta <code className="bg-gray-100 px-1 rounded">agent/</code> do projeto, copie <code className="bg-gray-100 px-1 rounded">.env.example</code> para <code className="bg-gray-100 px-1 rounded">.env</code> e preencha o token e o nome da impressora.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <span>
                        Descubra o nome da impressora: <code className="bg-gray-100 px-1 rounded">node list-printers.js</code>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                      <span>
                        Inicie o agente: <code className="bg-gray-100 px-1 rounded">node agent.js</code>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">5</span>
                      <span>
                        Pronto! O agente vai imprimir automaticamente quando o ML liberar etiquetas.
                      </span>
                    </li>
                  </ol>
                </div>

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Mantenha o agente rodando na máquina onde a impressora está conectada.
                    O computador precisa estar ligado e com Node.js 18+ instalado.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
