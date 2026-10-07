import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { loadLabelPdf } from '../lib/labelPdf';

function friendlyErrorMessage(detail: string): string {
  if (/not yet ready|ainda não está pronta/i.test(detail)) {
    return 'A etiqueta ainda não está pronta na Shopee. Aguarde alguns minutos e tente novamente.';
  }
  return 'Não foi possível carregar a etiqueta. Tente novamente.';
}

type InvoiceItem = {
  shipmentId: string;
  invoice: any;
};

export default function PrintLabels() {
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [printReady, setPrintReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loggedRef = useRef(false);

  // Which connected account these labels belong to (optional — defaults to
  // the user's mercadolivre account server-side for backwards compat).
  const accountId = searchParams.get('account_id') || '';
  const provider = searchParams.get('provider') || '';

  const rawIds = searchParams.get('shipment_ids') || searchParams.get('shipmentIds') || '';
  const shipmentIds = rawIds
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const run = async () => {
      if (shipmentIds.length === 0) {
        setError('Nenhuma etiqueta selecionada.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPrintReady(false);
      setPdfUrl('');
      loggedRef.current = false;

      try {
        const params = new URLSearchParams({ shipment_ids: shipmentIds.join(',') });
        if (accountId) params.set('account_id', accountId);
        if (provider) params.set('provider', provider);
        const url = `/api/labels/pdf?${params.toString()}`;
        const pdf = await loadLabelPdf(url, controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(pdf);
        setPdfUrl(objectUrl);
        setLoading(false);

        try {
          const invRes = await fetch('/api/labels/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ shipmentIds, accountId: accountId || undefined })
          });

          if (invRes.ok) {
            const data = await invRes.json();
            setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
          }
        } catch {
          setInvoices([]);
        }

      } catch (error) {
        if (controller.signal.aborted) return;
        setError(error instanceof Error ? error.message : 'Erro ao carregar etiquetas.');
        setLoading(false);
      }
    };

    run();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rawIds, accountId, provider]);

  const printLabels = () => {
    if (!printReady || !iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
      // This records opening the print dialog, not physical printer success.
      if (!loggedRef.current) {
        loggedRef.current = true;
        fetch('/api/labels/print-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ shipmentIds, accountId: accountId || undefined, provider: provider || undefined })
        }).catch(() => { });
      }
    } catch {
      setError('Não foi possível abrir a impressão. Abra o PDF e imprima pelo visualizador.');
    }
  };

  const openInvoices = () => {
    const urls = invoices
      .map((i) => i?.invoice?.fiscal_document?.pdf_url)
      .filter((u) => typeof u === 'string' && u.length > 0) as string[];

    for (const url of urls) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @page {
          size: 100mm 150mm !important;
          margin: 0mm !important;
          padding: 0mm !important;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          iframe {
            height: 100vh !important;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : error ? 'Erro ao carregar a etiqueta' : `Etiquetas (${shipmentIds.length})`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={printLabels}
            disabled={!printReady}
          >
            Imprimir
          </Button>
          <Button
            variant="outline"
            onClick={openInvoices}
            disabled={invoices.length === 0}
          >
            Abrir NFs
          </Button>
        </div>
      </div>

      {pdfUrl && (
        <div className="no-print px-4 py-2 text-sm">
          {printReady ? 'PDF carregado. Confira a etiqueta e clique em Imprimir.' : 'Abrindo PDF...'}
          {' '}<a href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a>
        </div>
      )}
      {error ? (
        <div className="p-6 text-foreground">
          <p>{friendlyErrorMessage(error)}</p>
          <p className="mt-3 text-xs text-muted-foreground break-words">Detalhe técnico: {error.replace(/\s*A etiqueta ainda não está pronta na Shopee\. Aguarde alguns minutos e tente novamente\.?/gi, '').trim()}</p>
        </div>
      ) : pdfUrl ? (
        <iframe
          ref={iframeRef}
          onLoad={() => setPrintReady(true)}
          onError={() => { setPrintReady(false); setError('Não foi possível abrir o PDF.'); }}
          src={pdfUrl}
          style={{
            width: '100%',
            height: 'calc(100vh - 60px)',
            border: 'none'
          }}
          title="Etiquetas"
        />
      ) : null}

      {invoices.length > 0 && (
        <div className="no-print p-4 border-t border-border">
          <div className="text-sm font-semibold text-foreground mb-2">NFs</div>
          <div className="space-y-2">
            {invoices
              .map((i) => ({
                shipmentId: i.shipmentId,
                url: i?.invoice?.fiscal_document?.pdf_url as string | undefined
              }))
              .filter((x) => typeof x.url === 'string' && x.url.length > 0)
              .map((x) => (
                <a
                  key={x.shipmentId}
                  href={x.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-primary underline text-sm"
                >
                  NF do envio {x.shipmentId}
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
