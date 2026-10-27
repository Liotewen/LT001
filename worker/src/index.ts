import {
  InputError,
  SESSION_COOKIE,
  SESSION_SECONDS,
  buildUpstreamChatRequest,
  createSessionToken,
  normalizeUpstreamError,
  parseChatBody,
  parseLoginBody,
  verifySessionToken,
} from './core';

export interface Env {
  XJ_API_KEY: string;
  APP_USERNAME: string;
  APP_PASSWORD: string;
  APP_SESSION_SECRET: string;
  XJ_API_BASE_URL: string;
  WEB_ORIGIN: string;
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } });
}

function corsHeaders(env: Env) {
  return {
    'access-control-allow-origin': env.WEB_ORIGIN,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'Origin',
  };
}

function withCors(response: Response, env: Env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorResponse(code: string, message: string, status: number, env: Env) {
  return withCors(json({ error: { code, message } }, status), env);
}

function cookieValue(request: Request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === SESSION_COOKIE) return part.slice(separator + 1).trim();
  }
  return null;
}

async function session(request: Request, env: Env) {
  const authorization = request.headers.get('authorization');
  const token = authorization ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : cookieValue(request);
  if (!token || !env.APP_SESSION_SECRET) return null;
  const current = await verifySessionToken(token, env.APP_SESSION_SECRET);
  return current?.username === env.APP_USERNAME ? current : null;
}

function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function allowOrigin(request: Request, env: Env) {
  return Boolean(env.WEB_ORIGIN) && request.headers.get('origin') === env.WEB_ORIGIN;
}

async function requestJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    throw new InputError('请求格式无效');
  }
}

function safeProviderStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;
  let completed = false;
  const encoder = new TextEncoder();
  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  const emitLine = (controller: ReadableStreamDefaultController<Uint8Array>, line: string) => {
    if (!line.startsWith('data:') || completed) return;
    const raw = line.slice(5).trim();
    if (!raw) return;
    if (raw === '[DONE]') {
      completed = true;
      emit(controller, 'done', {});
      return;
    }
    try {
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (payload.error) {
        completed = true;
        emit(controller, 'error', { code: 'PROVIDER_ERROR', message: '模型请求失败，请稍后重试' });
        return;
      }
      const choices = payload.choices;
      const firstChoice = Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
        ? choices[0] as Record<string, unknown> : null;
      const delta = firstChoice?.delta;
      const content = delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).content === 'string'
        ? (delta as Record<string, unknown>).content : null;
      if (content) {
        emit(controller, 'delta', { content });
      }
      if (typeof firstChoice?.finish_reason === 'string') {
        completed = true;
        if (firstChoice.finish_reason === 'stop') emit(controller, 'done', {});
        else emit(controller, 'error', { code: 'INCOMPLETE_REPLY', message: '本次回复未完整结束，可以继续提问。' });
      }
    } catch {
      // Ignore provider diagnostics; only normalized events cross the proxy.
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!closed) {
          const result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0 && !closed) {
            emitLine(controller, buffer.slice(0, newline).replace(/\r$/, ''));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
          }
        }
        if (!closed) {
          buffer += decoder.decode();
          if (buffer) emitLine(controller, buffer.replace(/\r$/, ''));
          if (!completed) emit(controller, 'error', { code: 'STREAM_INTERRUPTED', message: '回复连接中断，请稍后重试。' });
          controller.close();
        }
      } catch {
        if (!closed) {
          emit(controller, 'error', { code: 'STREAM_INTERRUPTED', message: '回复连接中断，请稍后重试。' });
          controller.close();
        }
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      closed = true;
      await reader.cancel().catch(() => undefined);
    },
  });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!allowOrigin(request, env)) return errorResponse('CORS_REJECTED', '请求来源不受支持', 403, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    let credentials;
    try {
      credentials = parseLoginBody(await requestJson(request));
    } catch (error) {
      const input = error instanceof InputError ? error : new InputError('请输入账号和密码');
      return errorResponse(input.code, input.message, 400, env);
    }
    if (!env.APP_USERNAME || !env.APP_PASSWORD || !env.APP_SESSION_SECRET) return errorResponse('SERVER_CONFIG', '登录服务尚未配置', 503, env);
    if (credentials.username !== env.APP_USERNAME || credentials.password !== env.APP_PASSWORD) {
      return errorResponse('INVALID_CREDENTIALS', '账号或密码错误', 401, env);
    }
    const token = await createSessionToken(credentials.username, env.APP_SESSION_SECRET);
    return withCors(json({ authenticated: true, username: credentials.username, token }, 200, { 'set-cookie': sessionCookie(token, request) }), env);
  }

  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const current = await session(request, env);
    if (!current) return errorResponse('UNAUTHORIZED', '请先登录', 401, env);
    return withCors(json({ authenticated: true, username: current.username }), env);
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    return withCors(new Response(null, { status: 204, headers: { 'set-cookie': clearSessionCookie(request) } }), env);
  }

  if (url.pathname === '/api/chat' && request.method === 'POST') {
    if (!await session(request, env)) return errorResponse('UNAUTHORIZED', '请先登录', 401, env);
    let body;
    try {
      body = parseChatBody(await requestJson(request));
    } catch (error) {
      const input = error instanceof InputError ? error : new InputError('请求格式无效');
      return errorResponse(input.code, input.message, 400, env);
    }
    if (!env.XJ_API_KEY || !env.XJ_API_BASE_URL) return errorResponse('SERVER_CONFIG', '模型服务尚未配置', 503, env);
    const endpoint = `${env.XJ_API_BASE_URL.replace(/\/+$/, '')}/codex/chat/completions`;
    let upstream: Response;
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.XJ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(buildUpstreamChatRequest(body.messages, body.reasoningEffort)),
        signal: request.signal,
      });
    } catch {
      const mapped = normalizeUpstreamError(0);
      return errorResponse(mapped.code, mapped.message, mapped.status, env);
    }
    if (!upstream.ok) {
      const mapped = normalizeUpstreamError(upstream.status);
      return errorResponse(mapped.code, mapped.message, mapped.status, env);
    }
    if (!upstream.body) return errorResponse('PROVIDER_UNAVAILABLE', '模型服务没有返回内容，请稍后重试', 503, env);
    return withCors(new Response(safeProviderStream(upstream.body), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    }), env);
  }

  return errorResponse('NOT_FOUND', '接口不存在', 404, env);
}

const worker = {
  fetch(request: Request, env: Env) {
    return handle(request, env);
  },
};

export default worker;
