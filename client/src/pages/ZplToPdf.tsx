import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Loader2, ArrowRight, CheckCircle, Copy, Check } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import { SEO_PAGES } from '../content/seoPages';

const PAGE = SEO_PAGES['/converter-zpl-pdf'];

const EMBED_CODE = `<iframe src="https://labelgo.com.br/embed/converter-zpl-pdf/" width="100%" height="420" style="border:1px solid #e5e7eb;border-radius:12px" title="Conversor de ZPL para PDF — LabelGo" loading="lazy"></iframe>
<p style="font-size:12px;color:#6b7280">Conversor por <a href="https://labelgo.com.br/converter-zpl-pdf/">LabelGo</a></p>`;

export default function ZplToPdf({ embed = false }: { embed?: boolean } = {}) {
  const [zpl, setZpl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(EMBED_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível — o usuário pode selecionar o código manualmente.
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {!embed && <Header />}

      <main className={embed ? 'max-w-2xl mx-auto px-4 py-6' : 'max-w-3xl mx-auto px-4 py-12'}>
        {/* Hero */}
        <div className={embed ? 'mb-4' : 'text-center mb-8'}>
          <h1 className={embed ? 'text-xl font-bold text-foreground mb-1' : 'text-3xl font-bold text-foreground mb-3'}>
            Conversor de ZPL para PDF — Grátis
          </h1>
          <p className={embed ? 'text-sm text-muted-foreground' : 'text-muted-foreground'}>
            Cole seu código ZPL e baixe o PDF da etiqueta. Sem login, sem cadastro.
          </p>
        </div>

        {/* Tool */}
        <div className={`bg-surface rounded-2xl border border-border shadow-sm mb-6 ${embed ? 'p-4' : 'p-6'}`}>
          <label className="block text-sm font-medium text-foreground mb-2">
            Código ZPL
          </label>
          <textarea
            value={zpl}
            onChange={(e) => setZpl(e.target.value)}
            placeholder="^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
            className={`w-full p-3 bg-surface border border-gray-300 rounded-lg font-mono text-sm placeholder:text-placeholder focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors ${embed ? 'h-40' : 'h-48'}`}
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

        {embed ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Conversor por{' '}
            <a
              href="https://labelgo.com.br/converter-zpl-pdf/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              LabelGo
            </a>
          </p>
        ) : (
          <>
            {/* Embed snippet — link building */}
            <section className="bg-surface rounded-2xl border border-border p-6 mb-6" aria-labelledby="embed-title">
              <h2 id="embed-title" className="text-lg font-semibold text-foreground mb-2">
                Embuta o conversor no seu site
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                Copie o código e cole no seu blog ou página de ajuda. O conversor abre em um
                iframe, com link de atribuição para o LabelGo.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground">
                <code>{EMBED_CODE}</code>
              </pre>
              <button
                type="button"
                onClick={copyEmbed}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar código'}
              </button>
            </section>

            {/* CTA */}
            <div className="bg-primary rounded-2xl p-6 text-white text-center">
              <FileText className="w-10 h-10 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-2">
                Cansado de converter etiquetas manualmente?
              </h2>
              <p className="text-white/80 mb-4">
                Conecte seu Mercado Livre ao LabelGo e imprima etiquetas em segundos.
                Com o LabelGo Completo, suas etiquetas saem automaticamente na impressora.
              </p>
              <Link
                to="/pricing/"
                className="bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-secondary hover:text-foreground transition-all duration-150 hover:-translate-y-px inline-flex items-center gap-2"
              >
                Testar grátis por 7 dias
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* SEO content */}
            <div className="mt-8 prose prose-sm text-muted-foreground">
              <h2 className="text-lg font-semibold text-foreground">Como usar o conversor</h2>
              <p>
                Copie o código ZPL da sua etiqueta — ele começa com <code>^XA</code> e termina
                com <code>^XZ</code> — cole na caixa acima e clique em converter. O PDF é baixado
                na hora e imprime em qualquer impressora instalada, comum ou térmica com driver.
              </p>
              <h2 className="text-lg font-semibold text-foreground mt-6">Sobre ZPL e etiquetas térmicas</h2>
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

            {/* FAQ — mesma fonte do JSON-LD FAQPage (content/seoPages.ts) */}
            {PAGE.faqs && (
              <section className="mt-10" aria-labelledby="faq-title">
                <h2 id="faq-title" className="text-lg font-semibold text-foreground mb-4">
                  Perguntas frequentes
                </h2>
                <div className="space-y-5">
                  {PAGE.faqs.map((f) => (
                    <div key={f.q}>
                      <h3 className="font-semibold text-foreground">{f.q}</h3>
                      <p className="mt-1 text-muted-foreground leading-relaxed text-sm">{f.a}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {PAGE.related && (
              <nav className="mt-10 border-t border-border pt-8" aria-label="Páginas relacionadas">
                <h2 className="text-lg font-semibold text-foreground mb-4">Veja também</h2>
                <ul className="grid sm:grid-cols-3 gap-3">
                  {PAGE.related.map((r) => (
                    <li key={r.href}>
                      <Link
                        to={r.href}
                        className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                      >
                        <span className="block font-semibold text-foreground text-sm">{r.title}</span>
                        <span className="block text-muted-foreground text-sm mt-1">{r.desc}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
