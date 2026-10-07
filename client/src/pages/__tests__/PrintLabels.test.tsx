// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrintLabels from '../PrintLabels';

const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF');
const SHOPEE_DETAIL = 'Etiqueta Shopee indisponível: 260930CN5G6DMP/OFG244435051153248. logistics.package_can_not_print: The document is not yet ready for printing. Please try again later.';

function fakeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer
  } as Response;
}

// No instanceof here: jsdom globals come from a separate realm.
function pdfResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    arrayBuffer: async () => PDF.buffer
  } as Response;
}

function mockApi(mode: 'ok' | 'error') {
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    if (url.startsWith('/api/labels/pdf')) {
      return mode === 'ok'
        ? pdfResponse()
        : fakeResponse({ error: 'Failed to generate labels', details: SHOPEE_DETAIL }, false, 500);
    }
    if (url.startsWith('/api/labels/invoices')) return fakeResponse({ invoices: [] });
    if (url.startsWith('/api/labels/print-log')) return fakeResponse({ ok: true });
    throw new Error('unexpected ' + url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/print/labels?account_id=1&provider=shopee&shipment_ids=260930CN5G6DMP']}>
      <PrintLabels />
    </MemoryRouter>
  );
}

describe('PrintLabels print flow', () => {
  beforeEach(() => {
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps Imprimir disabled and shows the detailed Shopee error when the PDF fails', async () => {
    const calls = mockApi('error');
    renderPage();
    // Friendly message in place of the raw error; technical detail shown once.
    expect(await screen.findByText('A etiqueta ainda não está pronta na Shopee. Aguarde alguns minutos e tente novamente.')).toBeTruthy();
    expect(screen.getByText('Erro ao carregar a etiqueta')).toBeTruthy();
    expect(screen.getAllByText(/logistics\.package_can_not_print/)).toHaveLength(1);
    const button = screen.getByRole('button', { name: 'Imprimir' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(calls.some((c) => c.url.startsWith('/api/labels/print-log'))).toBe(false);
  });

  it('enables Imprimir only after the PDF frame loads and logs the print on click', async () => {
    const calls = mockApi('ok');
    const { container } = renderPage();
    const button = screen.getByRole('button', { name: 'Imprimir' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy());
    fireEvent.load(container.querySelector('iframe')!);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.getByText(/PDF carregado/)).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/labels/print-log'))).toBe(true));
    expect(screen.queryByText(/Erro ao carregar etiquetas/)).toBeNull();
  });
});
