/** A successful HTTP response is not enough: never display JSON as a PDF. */
export async function loadLabelPdfWithNotes(
  url: string,
  signal?: AbortSignal
): Promise<{ blob: Blob; notes: string[] }> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.details || body.message || body.error || 'Erro ao carregar etiquetas.');
  }
  const bytes = await response.arrayBuffer();
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== '%PDF-') throw new Error('A resposta recebida não contém uma etiqueta PDF válida.');
  const header2 = response.headers?.get?.('X-Print-Notes');
  const notes = header2 ? decodeURIComponent(header2).split(' | ').filter(Boolean) : [];
  return { blob: new Blob([bytes], { type: 'application/pdf' }), notes };
}

export async function loadLabelPdf(url: string, signal?: AbortSignal): Promise<Blob> {
  return (await loadLabelPdfWithNotes(url, signal)).blob;
}
