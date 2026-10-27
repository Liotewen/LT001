import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { createSessionToken } from '../src/core';

const env = {
  XJ_API_KEY: 'server-only-key',
  APP_USERNAME: 'owner',
  APP_PASSWORD: 'correct horse',
  APP_SESSION_SECRET: 'test-session-secret',
  XJ_API_BASE_URL: 'https://xjjuhe.site/v1',
  WEB_ORIGIN: 'https://liotewen.github.io',
};

const request = (path: string, init: RequestInit = {}) => new Request(`https://worker.example${path}`, {
  ...init,
  headers: {
    origin: env.WEB_ORIGIN,
    ...(init.headers || {}),
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('cloudflare worker routes', () => {
  it('rejects requests from an unconfigured origin', async () => {
    const response = await worker.fetch(new Request('https://worker.example/api/auth/me', { headers: { origin: 'https://evil.example' } }), env);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'CORS_REJECTED' } });

    const preflight = await worker.fetch(new Request('https://worker.example/api/chat', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
    expect(preflight.status).toBe(403);
  });

  it('logs in with valid credentials and sets an HttpOnly session cookie', async () => {
    const response = await worker.fetch(request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct horse' }),
    }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
  });

  it('rejects invalid credentials without revealing configured values', async () => {
    const response = await worker.fetch(request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'wrong' }),
    }), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: '账号或密码错误' } });
  });

  it('returns the authenticated user for a valid session', async () => {
    const token = await createSessionToken('owner', env.APP_SESSION_SECRET);
    const response = await worker.fetch(request('/api/auth/me', { headers: { cookie: `lt_chat_session=${token}` } }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true, username: 'owner' });
  });

  it('authenticates a cross-site browser without third-party cookies', async () => {
    const login = await worker.fetch(request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: env.APP_USERNAME, password: env.APP_PASSWORD }),
    }), env);
    const result = await login.json() as { token: string };
    expect(result.token).toEqual(expect.any(String));
    expect(login.headers.get('cache-control')).toBe('no-store');
    const response = await worker.fetch(request('/api/auth/me', {
      headers: { authorization: `Bearer ${result.token}` },
    }), env);
    expect(response.status).toBe(200);
    const preflight = await worker.fetch(request('/api/chat', { method: 'OPTIONS' }), env);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('rejects missing, forged and no-longer-current-user sessions', async () => {
    for (const token of ['', 'forged', await createSessionToken('old-user', env.APP_SESSION_SECRET)]) {
      const response = await worker.fetch(request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } }), env);
      expect(response.status).toBe(401);
    }
  });

  it('reports interrupted provider streams without forwarding raw provider data', async () => {
    const token = await createSessionToken('owner', env.APP_SESSION_SECRET);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: private upstream diagnostics\n\n')));
    const response = await worker.fetch(request('/api/chat', {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }], reasoningEffort: 'low' }),
    }), env);
    const stream = await response.text();
    expect(stream).toContain('STREAM_INTERRUPTED');
    expect(stream).not.toContain('private upstream diagnostics');
  });

  it('forwards complete context and reasoning effort while keeping the key server-side', async () => {
    const token = await createSessionToken('owner', env.APP_SESSION_SECRET);
    const fetchMock = vi.fn(async () => new Response([
      'data: {"choices":[{"delta":{"content":"收到"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join(''), { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(request('/api/chat', {
      method: 'POST',
      headers: {
        cookie: `lt_chat_session=${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '背景' },
          { role: 'assistant', content: '已记住' },
          { role: 'user', content: '继续' },
        ],
        reasoningEffort: 'high',
      }),
    }), env);
    const upstream = (fetchMock.mock.calls[0] as unknown as [RequestInfo, RequestInit])[1];
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('收到');
    expect(String(upstream.body)).not.toContain(env.XJ_API_KEY);
    expect(JSON.parse(String(upstream.body))).toMatchObject({ model: 'gpt-6.1-sol', reasoning_effort: 'high' });
    expect(new Headers(upstream.headers).get('authorization')).toBe(`Bearer ${env.XJ_API_KEY}`);
  });

  it('maps an upstream failure to a safe response', async () => {
    const token = await createSessionToken('owner', env.APP_SESSION_SECRET);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider secret details', { status: 401 })));
    const response = await worker.fetch(request('/api/chat', {
      method: 'POST',
      headers: { cookie: `lt_chat_session=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '测试' }], reasoningEffort: 'medium' }),
    }), env);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain('PROVIDER_AUTH');
    expect(text).not.toContain('provider secret details');
  });

  it('validates chat input before contacting the provider', async () => {
    const token = await createSessionToken('owner', env.APP_SESSION_SECRET);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(request('/api/chat', {
      method: 'POST',
      headers: { cookie: `lt_chat_session=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [], reasoningEffort: 'high' }),
    }), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
