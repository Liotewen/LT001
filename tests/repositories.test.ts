import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

let root: string;
let db: Database.Database | undefined;

function getDb() {
  if (!db) throw new Error('Test database is not initialized');
  return db;
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'lt-workspace-'));
  const { openDatabase } = await import('@/lib/db');
  db = openDatabase(join(root, 'test.db'));
});

afterEach(() => {
  db?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('workspace repositories', () => {
  it('persists projects and orders conversations by most recently updated', async () => {
    const repository = await import('@/lib/repositories');
    const project = repository.createProject({ name: '研究' }, db!);
    const first = repository.createConversation({ projectId: project.id, title: '旧会话' }, db!);
    const second = repository.createConversation({ projectId: project.id, title: '新会话' }, db!);
    getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', first.id);
    getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run('2026-01-02T00:00:00.000Z', second.id);

    expect(repository.listProjects(db!).length).toBe(1);
    expect(repository.listConversations(project.id, db!).map((item) => item.id)).toEqual([second.id, first.id]);
    expect(first.model).toBe('gpt-6.1-sol');
  });

  it('returns every message in chronological order for the full conversation context', async () => {
    const repository = await import('@/lib/repositories');
    const conversation = repository.createConversation({ title: '上下文' }, db!);
    const older = repository.insertMessage({ conversationId: conversation.id, role: 'user', content: '第一句' }, db!);
    const newer = repository.insertMessage({ conversationId: conversation.id, role: 'assistant', content: '第二句' }, db!);
    getDb().prepare('UPDATE messages SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', older.id);
    getDb().prepare('UPDATE messages SET created_at = ? WHERE id = ?').run('2026-01-02T00:00:00.000Z', newer.id);

    expect(repository.listMessages(conversation.id, db!).map((message) => message.content)).toEqual(['第一句', '第二句']);
  });
});
