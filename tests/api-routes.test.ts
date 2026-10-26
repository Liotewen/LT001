import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth';

let root: string;
const secret = 'api-test-secret';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lt-api-'));
  vi.stubEnv('DATABASE_PATH', join(root, 'api.db'));
  vi.stubEnv('APP_SESSION_SECRET', secret);
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(async () => {
  const { getDatabase } = await import('@/lib/db');
  getDatabase().close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const authorized = () => ({ cookie: `lt_session=${createSessionToken('owner', secret)}` });
const jsonRequest = (url: string, method: string, body?: unknown) => new Request(`http://localhost${url}`, {
  method,
  headers: { ...authorized(), 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe('workspace API routes', () => {
  it('rejects unauthenticated project access', async () => {
    const { GET } = await import('@/app/api/projects/route');
    const response = await GET(new Request('http://localhost/api/projects'));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('creates projects and fixed-model conversations behind the session', async () => {
    const projectsRoute = await import('@/app/api/projects/route');
    const conversationsRoute = await import('@/app/api/conversations/route');
    const projectResponse = await projectsRoute.POST(jsonRequest('/api/projects', 'POST', { name: '产品研究' }));
    const project = await projectResponse.json();
    const conversationResponse = await conversationsRoute.POST(jsonRequest('/api/conversations', 'POST', {
      projectId: project.id, title: '新会话', reasoningEffort: 'high',
    }));
    const conversation = await conversationResponse.json();

    expect(projectResponse.status).toBe(201);
    expect(conversationResponse.status).toBe(201);
    expect(conversation.model).toBe('gpt-6.1-sol');
    expect(conversation.reasoning_effort).toBe('high');
  });

  it('returns conversation messages in chronological order', async () => {
    const { createConversation, insertMessage } = await import('@/lib/repositories');
    const { getDatabase } = await import('@/lib/db');
    const db = getDatabase();
    const conversation = createConversation({ title: '上下文' }, db);
    const first = insertMessage({ conversationId: conversation.id, role: 'user', content: '记住这个需求' }, db);
    const second = insertMessage({ conversationId: conversation.id, role: 'assistant', content: '已记录' }, db);
    db.prepare('UPDATE messages SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', first.id);
    db.prepare('UPDATE messages SET created_at = ? WHERE id = ?').run('2026-01-02T00:00:00.000Z', second.id);
    const { GET } = await import('@/app/api/conversations/[id]/route');
    const response = await GET(new Request(`http://localhost/api/conversations/${conversation.id}`, { headers: authorized() }), {
      params: Promise.resolve({ id: conversation.id }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).messages.map((message: { content: string }) => message.content))
      .toEqual(['记住这个需求', '已记录']);
  });
});
