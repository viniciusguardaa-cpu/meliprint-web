/** A successful HTTP response is not enough: never display JSON as a PDF. */
export async function loadLabelPdf(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.details || body.message || body.error || 'Erro ao carregar etiquetas.');
  }
  const bytes = await response.arrayBuffer();
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== '%PDF-') throw new Error('A resposta recebida não contém uma etiqueta PDF válida.');
  return new Blob([bytes], { type: 'application/pdf' });
}
