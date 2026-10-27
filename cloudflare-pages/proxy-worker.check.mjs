import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProxyRequest } from './proxy.mjs';

test('proxies an allowed API request while preserving the browser origin and response body', async () => {
  const calls = [];
  const upstream = async (url, init) => {
    calls.push({ url, init });
    return new Response('{"authenticated":true}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'lt_chat_session=ignored' },
    });
  };

  const request = new Request('https://lt-ai-chat-proxy.pages.dev/api/auth/login?from=test', {
    method: 'POST',
    headers: {
      origin: 'https://liotewen.github.io',
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: '{"username":"owner","password":"secret"}',
  });
  const response = await handleProxyRequest(request, {}, upstream);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"authenticated":true}');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://liotewen.github.io');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://lt-chat-proxy.1347924816pjw.workers.dev/api/auth/login?from=test');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.get('origin'), 'https://liotewen.github.io');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer test-token');
  assert.equal(await new Response(calls[0].init.body).text(), '{"username":"owner","password":"secret"}');
});

test('rejects a request from an origin outside the GitHub Pages site', async () => {
  let called = false;
  const request = new Request('https://lt-ai-chat-proxy.pages.dev/api/auth/me', {
    headers: { origin: 'https://evil.example' },
  });
  const response = await handleProxyRequest(request, {}, async () => {
    called = true;
    return new Response('unexpected');
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: 'CORS_REJECTED', message: '请求来源不受支持' } });
  assert.equal(called, false);
});

test('answers browser preflight without forwarding a request', async () => {
  const response = await handleProxyRequest(new Request('https://lt-ai-chat-proxy.pages.dev/api/chat', {
    method: 'OPTIONS', headers: { origin: 'https://liotewen.github.io' },
  }), {}, async () => { throw new Error('Preflight must stay at the edge'); });

  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
});

test('streams the first reply chunk before the upstream finishes', async () => {
  let controller;
  const body = new ReadableStream({ start(value) { controller = value; } });
  const response = await handleProxyRequest(new Request('https://lt-ai-chat-proxy.pages.dev/api/chat', {
    method: 'POST', headers: { origin: 'https://liotewen.github.io' }, body: '{}',
  }), {}, async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  const reader = response.body.getReader();
  controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"content":"收到"}\n\n'));
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), 'event: delta\ndata: {"content":"收到"}\n\n');
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  controller.close();
  assert.equal((await reader.read()).done, true);
});

test('returns a safe error with CORS when the backend connection fails', async () => {
  const response = await handleProxyRequest(new Request('https://lt-ai-chat-proxy.pages.dev/api/auth/me', {
    headers: { origin: 'https://liotewen.github.io' },
  }), {}, async () => { throw new Error('private backend diagnostics'); });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://liotewen.github.io');
  const result = await response.text();
  assert.match(result, /UPSTREAM_UNAVAILABLE/);
  assert.doesNotMatch(result, /private backend diagnostics/);
});
