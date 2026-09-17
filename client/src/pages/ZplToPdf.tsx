import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Loader2, ArrowRight, CheckCircle } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '../components/ui/button';

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
      const visitorKey = localStorage.getItem('labelgo_visitor_key') || crypto.randomUUID();
      localStorage.setItem('labelgo_visitor_key', visitorKey);

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
      a.download = 'labelgo-label.pdf';
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
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Conversor de ZPL para PDF — Grátis
          </h1>
          <p className="text-muted-foreground">
            Cole seu código ZPL e baixe o PDF da etiqueta. Sem login, sem cadastro.
          </p>
        </div>

        {/* Tool */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Código ZPL
          </label>
          <textarea
            value={zpl}
            onChange={(e) => setZpl(e.target.value)}
            placeholder="^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
            className="w-full h-48 p-3 bg-surface border border-gray-300 rounded-lg font-mono text-sm placeholder:text-[#98A2B3] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
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

          <Button
            size="lg"
            onClick={handleConvert}
            disabled={loading || !zpl.trim()}
            className="mt-4 w-full"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Download className="w-5 h-5" />
                Converter para PDF
              </>
            )}
          </Button>
        </div>

        {/* CTA */}
        <div className="bg-primary rounded-2xl p-6 text-white text-center">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">
            Cansado de converter etiquetas manualmente?
          </h2>
          <p className="text-white/80 mb-4">
            Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.
            Com o LabelGo Pro, suas etiquetas saem automaticamente na impressora.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-secondary hover:text-foreground transition-colors inline-flex items-center gap-2"
          >
            Testar grátis por 7 dias
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* SEO content */}
        <div className="mt-8 prose prose-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Sobre ZPL e etiquetas térmicas</h2>
          <p>
            ZPL (Zebra Programming Language) é a linguagem usada por impressoras térmicas
            Zebra e compatíveis para imprimir etiquetas. O LabelGo converte seu código ZPL
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
