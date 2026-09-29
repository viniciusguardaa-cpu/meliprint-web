// Keep browser requests same-origin when the frontend moves from Netlify to
// Cloudflare Pages. The backend and its session store remain on Railway.

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  // Missing or invalid configuration must fail explicitly rather than proxy elsewhere.
  let backend;
  try {
    backend = new URL(env.BACKEND_URL);
    if (!['https:', 'http:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('Invalid backend');
  } catch {
    return new Response('API backend not configured', { status: 503 });
  }
  const target = new URL(incoming.pathname + incoming.search, backend);
  const headers = new Headers(request.headers);
  // Do not forward the public hostname as the backend Host header.
  headers.delete('host');
  const response = await fetch(new Request(target, { method: request.method, headers,
    body: request.body, redirect: 'manual' }));
  // Preserve Set-Cookie and Location from auth and checkout responses. The
  // session cookie has no Domain attribute, so it binds to labelgo.com.br.
  return new Response(response.body, response);
}
