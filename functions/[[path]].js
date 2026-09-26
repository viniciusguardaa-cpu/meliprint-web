// Preserve browser URLs for private SPA routes while serving the prerendered
// noindex shell. Static Pages redirects canonicalize .html to an extensionless
// path and break React Router on a hard refresh.
const PRIVATE_ROUTES = [
  /^\/dashboard(?:\/|$)/,
  /^\/print(?:\/|$)/,
  /^\/auto-print$/,
  /^\/subscription(?:\/|$)/,
  /^\/configuracoes$/,
];

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const isAdmin = /^\/admin(?:\/|$)/.test(url.pathname);
  if (!isAdmin && !PRIVATE_ROUTES.some((route) => route.test(url.pathname))) {
    return env.ASSETS.fetch(request);
  }
  // ASSETS.fetch receives the pretty path and returns a response, not a
  // browser redirect. Keep the original URL so React Router sees its route.
  const shell = new URL(isAdmin ? '/admin' : '/spa', url);
  const response = await env.ASSETS.fetch(new Request(shell, { method: request.method }));
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, headers });
}
