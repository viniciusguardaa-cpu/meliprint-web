import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type InvoiceItem = {
  shipmentId: number;
  invoice: any;
};

export default function PrintLabels() {
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [printReady, setPrintReady] = useState(false);

  const rawIds = searchParams.get('shipment_ids') || searchParams.get('shipmentIds') || '';
  const shipmentIds = rawIds
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  useEffect(() => {
    const run = async () => {
      if (shipmentIds.length === 0) {
        setError('Nenhuma etiqueta selecionada.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = `/api/labels/pdf?shipment_ids=${encodeURIComponent(shipmentIds.join(','))}`;
        setPdfUrl(url);

        try {
          const invRes = await fetch('/api/labels/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ shipmentIds })
          });

          if (invRes.ok) {
            const data = await invRes.json();
            setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
          }
        } catch {
          setInvoices([]);
        }

        setPrintReady(true);
        setLoading(false);

        setTimeout(() => {
          try {
            window.focus();
            window.print();
          } catch {
          }
        }, 500);
      } catch {
        setError('Erro ao carregar etiquetas.');
        setLoading(false);
      }
    };

    run();
  }, [rawIds]);

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

      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? 'Carregando...' : error ? error : `Etiquetas (${shipmentIds.length})`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            disabled={!printReady}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            Imprimir
          </button>
          <button
            onClick={openInvoices}
            disabled={invoices.length === 0}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            Abrir NFs
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-6 text-gray-700">{error}</div>
      ) : pdfUrl ? (
        <iframe
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
        <div className="no-print p-4 border-t">
          <div className="text-sm font-semibold text-gray-700 mb-2">NFs</div>
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
                  className="block text-brand-500 underline text-sm"
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
