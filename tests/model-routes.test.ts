import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth';

let root: string;
const secret = 'model-route-test-secret';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lt-model-route-'));
  vi.stubEnv('DATABASE_PATH', join(root, 'model.db'));
  vi.stubEnv('APP_SESSION_SECRET', secret);
  vi.stubEnv('XJ_API_KEY', 'provider-test-key');
  vi.stubEnv('XJ_API_BASE_URL', 'https://xjjuhe.site/v1');
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(async () => {
  const { getDatabase } = await import('@/lib/db');
  getDatabase().close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});

const authorized = () => ({ cookie: `lt_session=${createSessionToken('owner', secret)}` });

describe('model routes', () => {
  it('accepts a documented landscape image size and rejects unsupported sizes', async () => {
    const { createConversation } = await import('@/lib/repositories');
    const { getDatabase } = await import('@/lib/db');
    const conversation = createConversation({ title: '尺寸校验' }, getDatabase());
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      task_id: 'provider-task-size', status: 'queued',
    }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/images/route');

    const supported = await POST(new Request('http://localhost/api/images', {
      method: 'POST', headers: { ...authorized(), 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, prompt: '测试横图', size: '1280x720' }),
    }));
    const payload = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

    expect(supported.status).toBe(202);
    expect(JSON.parse(String(payload?.body))).toMatchObject({ model: 'gpt-image-2.5', size: '1280x720' });

    const unsupported = await POST(new Request('http://localhost/api/images', {
      method: 'POST', headers: { ...authorized(), 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, prompt: '旧尺寸', size: '1536x1024' }),
    }));
    expect(unsupported.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('sends full chat context, streams deltas, and persists the assistant reply', async () => {
    const { createConversation, insertMessage, listMessages } = await import('@/lib/repositories');
    const { getDatabase } = await import('@/lib/db');
    const db = getDatabase();
    const conversation = createConversation({ title: '持续上下文' }, db);
    insertMessage({ conversationId: conversation.id, role: 'user', content: '我在做一个移动端工作区' }, db);
    insertMessage({ conversationId: conversation.id, role: 'assistant', content: '我会记住这个背景' }, db);
    const providerStream = [
      'data: {"choices":[{"delta":{"content":"明白，"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"继续吧。"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const fetchMock = vi.fn(async () => new Response(providerStream, {
      headers: { 'content-type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(new Request('http://localhost/api/chat', {
      method: 'POST', headers: { ...authorized(), 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, content: '基于刚才的背景继续', reasoningEffort: 'high' }),
    }));
    const streamText = await response.text();
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const providerPayload = JSON.parse(String(options.body));

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(streamText).toContain('明白，');
    expect(streamText).toContain('继续吧。');
    expect(providerPayload.reasoning_effort).toBe('high');
    expect(providerPayload.messages).toHaveLength(3);
    expect(listMessages(conversation.id, db).map((message) => message.content)).toEqual([
      '我在做一个移动端工作区', '我会记住这个背景', '基于刚才的背景继续', '明白，继续吧。',
    ]);
  });

  it('polls image tasks and persists the completed image in its conversation', async () => {
    const { createConversation, listMessages } = await import('@/lib/repositories');
    const { getDatabase } = await import('@/lib/db');
    const db = getDatabase();
    const conversation = createConversation({ title: '图片测试' }, db);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'provider-task-1', status: 'processing' }), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        task_id: 'provider-task-1', status: 'completed', data: [{ url: 'https://images.example/result.png' }],
      }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const createRoute = await import('@/app/api/images/route');
    const createResponse = await createRoute.POST(new Request('http://localhost/api/images', {
      method: 'POST', headers: { ...authorized(), 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, prompt: '一张简洁的产品概念图', size: '1024x1024', count: 1 }),
    }));
    const task = await createResponse.json();
    const statusRoute = await import('@/app/api/images/[id]/route');
    const statusResponse = await statusRoute.GET(new Request(`http://localhost/api/images/${task.id}`, {
      headers: authorized(),
    }), { params: Promise.resolve({ id: task.id }) });
    const completed = await statusResponse.json();

    expect(createResponse.status).toBe(202);
    expect(completed.status).toBe('complete');
    expect(completed.image_url).toBe('https://images.example/result.png');
    expect(listMessages(conversation.id, db).at(-1)).toMatchObject({ role: 'assistant', image_url: completed.image_url });
  });

  it('persists every task returned for a multi-image request', async () => {
    const { createConversation, listImageTasks } = await import('@/lib/repositories');
    const { getDatabase } = await import('@/lib/db');
    const db = getDatabase();
    const conversation = createConversation({ title: '多图测试' }, db);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      object: 'image.task.list',
      model: 'gpt-image-2.5',
      status: 'queued',
      n: 2,
      data: [
        { id: 'provider-task-1', task_id: 'provider-task-1', status: 'queued' },
        { id: 'provider-task-2', task_id: 'provider-task-2', status: 'queued' },
      ],
    }), { headers: { 'content-type': 'application/json' } })));
    const { POST } = await import('@/app/api/images/route');

    const response = await POST(new Request('http://localhost/api/images', {
      method: 'POST', headers: { ...authorized(), 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, prompt: '两张海报', size: '1024x1024', count: 2 }),
    }));
    const tasks = await response.json();

    expect(response.status).toBe(202);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task: { provider_task_id: string }) => task.provider_task_id)).toEqual([
      'provider-task-1', 'provider-task-2',
    ]);
    expect(listImageTasks(conversation.id, db)).toHaveLength(2);
  });
});
