import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

type InvoiceItem = {
  shipmentId: number;
  invoice: any;
};

export default function PrintLabels() {
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [printReady, setPrintReady] = useState(false);

  const rawIds = searchParams.get('shipment_ids') || searchParams.get('shipmentIds') || '';
  const shipmentIds = rawIds
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  useEffect(() => {
    const run = async () => {
      if (!containerRef.current) return;
      if (shipmentIds.length === 0) {
        setError('Nenhuma etiqueta selecionada.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPrintReady(false);
      containerRef.current.innerHTML = '';

      try {
        const res = await fetch(`/api/labels/pdf?shipment_ids=${encodeURIComponent(shipmentIds.join(','))}`, {
          credentials: 'include'
        });

        if (!res.ok) {
          setError('Erro ao carregar etiquetas.');
          setLoading(false);
          return;
        }

        const pdfBytes = await res.arrayBuffer();
        const pdf = await getDocument({ data: pdfBytes }).promise;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2 });

          const pageWrap = document.createElement('div');
          pageWrap.style.pageBreakAfter = 'always';
          pageWrap.style.breakAfter = 'page';
          pageWrap.style.display = 'flex';
          pageWrap.style.justifyContent = 'center';
          pageWrap.style.alignItems = 'center';
          pageWrap.style.padding = '0';
          pageWrap.style.margin = '0';

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.maxWidth = '900px';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';

          pageWrap.appendChild(canvas);
          containerRef.current.appendChild(pageWrap);

          await page.render({ canvasContext: ctx, viewport }).promise;
        }

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
        }, 250);
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
      <style>{`@page { margin: 0; } body { margin: 0; } @media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? 'Carregando...' : error ? error : `Etiquetas (${shipmentIds.length})`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            disabled={!printReady}
            className="bg-[#2F6FED] hover:bg-[#1e4fbd] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
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
      ) : (
        <div ref={containerRef} className="p-0" />
      )}

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
                  className="block text-[#2F6FED] underline text-sm"
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
