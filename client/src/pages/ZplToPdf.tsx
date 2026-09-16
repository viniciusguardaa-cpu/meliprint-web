import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Loader2, ArrowRight, CheckCircle } from 'lucide-react';
import Header from '../components/Header';

export default function ZplToPdf() {
  const navigate = useNavigate();
  const [zpl, setZpl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConvert = async () => {
    if (!zpl.trim()) {
      setError('Cole seu código ZPL acima');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const visitorKey = localStorage.getItem('printly_visitor_key') || crypto.randomUUID();
      localStorage.setItem('printly_visitor_key', visitorKey);

      const res = await fetch('/api/tools/zpl-to-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-key': visitorKey,
        },
        body: JSON.stringify({ zpl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao converter');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = 'printly-label.pdf';
      a.click();
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao converter');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Conversor de ZPL para PDF — Grátis
          </h1>
          <p className="text-gray-600">
            Cole seu código ZPL e baixe o PDF da etiqueta. Sem login, sem cadastro.
          </p>
        </div>

        {/* Tool */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Código ZPL
          </label>
          <textarea
            value={zpl}
            onChange={(e) => setZpl(e.target.value)}
            placeholder="^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
            className="w-full h-48 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              PDF gerado com sucesso! Verifique seus downloads.
            </div>
          )}

          <button
            onClick={handleConvert}
            disabled={loading || !zpl.trim()}
            className="mt-4 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Download className="w-5 h-5" />
                Converter para PDF
              </>
            )}
          </button>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-2xl p-6 text-white text-center">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">
            Cansado de converter etiquetas manualmente?
          </h2>
          <p className="text-blue-100 mb-4">
            Conecte seu Mercado Livre ao Printly e imprima etiquetas em segundos.
            Com o Printly Pro, suas etiquetas saem automaticamente na impressora.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="bg-white text-brand-600 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors inline-flex items-center gap-2"
          >
            Testar grátis por 7 dias
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* SEO content */}
        <div className="mt-8 prose prose-sm text-gray-600">
          <h2 className="text-lg font-semibold text-gray-900">Sobre ZPL e etiquetas térmicas</h2>
          <p>
            ZPL (Zebra Programming Language) é a linguagem usada por impressoras térmicas
            Zebra e compatíveis para imprimir etiquetas. O Printly converte seu código ZPL
            em PDF para visualização e impressão em qualquer impressora comum.
          </p>
          <p>
            Para etiquetas do Mercado Livre, o formato ZPL2 é usado em impressoras térmicas
            para etiquetas 10x15cm. Este conversor gratuito ajuda você a visualizar e
            imprimir etiquetas ZPL sem precisar de uma impressora térmica.
          </p>
        </div>
      </main>
    </div>
  );
}
