// Keep browser requests same-origin when the frontend moves from Netlify to
// Cloudflare Pages. The backend and its session store remain on Railway.
const BACKEND = 'https://web-production-c2ba5.up.railway.app';

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, BACKEND);
  const headers = new Headers(request.headers);
  // Do not forward the public hostname as the backend Host header.
  headers.delete('host');
  const response = await fetch(new Request(target, { method: request.method, headers,
    body: request.body, redirect: 'manual' }));
  // Preserve Set-Cookie and Location from auth and checkout responses. The
  // session cookie has no Domain attribute, so it binds to labelgo.com.br.
  return new Response(response.body, response);
}
