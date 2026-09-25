/**
 * Server API client — every call checks the HTTP status and throws on
 * non-2xx so callers can distinguish "printer failed" from "server
 * confirmation failed".
 */
async function post(serverUrl, token, path, body) {
  const resp = await fetch(`${serverUrl}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (resp.status === 401) {
    throw new Error('Token do agente inválido. Gere um novo código de pareamento no painel do LabelGo.');
  }
  if (resp.status === 403) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(data.error === 'subscription_required'
      ? 'Assinatura inativa — jobs suspensos. Renove a assinatura no painel.'
      : `Acesso negado (${resp.status})`);
    err.status = 403;
    err.code = data.error;
    throw err;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Server error ${resp.status}: ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  return resp.status === 204 ? {} : resp.json().catch(() => ({}));
}

export function claimJobs(serverUrl, token, agentId, limit = 5) {
  return post(serverUrl, token, '/api/auto-print/queue/claim', { agentId, limit })
    .then((data) => data.jobs || []);
}

export function confirmPrinted(serverUrl, token, jobId, sentToPrinterAt) {
  return post(serverUrl, token, `/api/auto-print/queue/${jobId}/printed`, {
    sentToPrinterAt,
    result: 'spooler_accepted',
  });
}

export function markFailed(serverUrl, token, jobId, error) {
  return post(serverUrl, token, `/api/auto-print/queue/${jobId}/failed`, {
    error: String(error).slice(0, 500),
  });
}

export function sendHeartbeat(serverUrl, token, agentId) {
  return post(serverUrl, token, '/api/auto-print/heartbeat', { agentId });
}

/**
 * Exchange a pairing code (shown in the web panel) for an agent token.
 * No auth header — the short-lived code is the credential.
 */
export async function pairWithCode(serverUrl, code) {
  let resp;
  try {
    resp = await fetch(`${serverUrl}/api/agent/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique a internet e tente novamente.');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Pareamento falhou (${resp.status})`);
  }
  return data; // { agentToken, printerName, agentId }
}
