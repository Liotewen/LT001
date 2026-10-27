const BACKEND = 'https://lt-chat-proxy.1347924816pjw.workers.dev';
const ALLOWED_ORIGIN = 'https://liotewen.github.io';
const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'cache-control': 'no-store',
  vary: 'Origin',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

export async function handleProxyRequest(request, env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (request.headers.get('origin') !== ALLOWED_ORIGIN) {
    return json({ error: { code: 'CORS_REJECTED', message: '请求来源不受支持' } }, 403);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const headers = new Headers(request.headers);
  headers.delete('host');
  try {
    const upstream = await upstreamFetch(BACKEND + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS)) responseHeaders.set(key, value);
    return new Response(upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
    });
  } catch {
    return json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: '接口暂时不可用，请稍后重试' } }, 503);
  }
}
