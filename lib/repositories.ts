import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { CHAT_MODEL } from '@/lib/constants';
import { getDatabase } from '@/lib/db';
import { normalizeTitle, type ReasoningEffort } from '@/lib/validation';

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  project_id: string | null;
  title: string;
  model: string;
  reasoning_effort: ReasoningEffort;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image_url: string | null;
  status: 'pending' | 'complete' | 'error';
  created_at: string;
}

export interface ImageTask {
  id: string;
  conversation_id: string | null;
  prompt: string;
  provider_task_id: string | null;
  status: 'pending' | 'processing' | 'complete' | 'error';
  image_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString();

export function createProject(input: { name: string; color?: string }, db: Database.Database = getDatabase()) {
  const timestamp = now();
  const project = { id: randomUUID(), name: input.name.trim(), color: input.color || '#315e4a', archived: 0, created_at: timestamp, updated_at: timestamp };
  db.prepare('INSERT INTO projects (id, name, color, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(project.id, project.name, project.color, project.archived, project.created_at, project.updated_at);
  return project;
}

export function listProjects(db: Database.Database = getDatabase(), includeArchived = false) {
  return db.prepare('SELECT * FROM projects WHERE archived = ? ORDER BY updated_at DESC, name COLLATE NOCASE ASC')
    .all(includeArchived ? 1 : 0) as Project[];
}

export function getProject(id: string, db: Database.Database = getDatabase()) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function updateProject(id: string, input: { name?: string; color?: string; archived?: boolean }, db: Database.Database = getDatabase()) {
  const current = getProject(id, db);
  if (!current) return null;
  const updated = { ...current, ...input, archived: input.archived === undefined ? current.archived : Number(input.archived), updated_at: now() };
  db.prepare('UPDATE projects SET name = ?, color = ?, archived = ?, updated_at = ? WHERE id = ?')
    .run(updated.name, updated.color, updated.archived, updated.updated_at, id);
  return updated;
}

export function deleteProject(id: string, db: Database.Database = getDatabase()) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

export function createConversation(
  input: { projectId?: string | null; title?: string; reasoningEffort?: ReasoningEffort },
  db: Database.Database = getDatabase(),
) {
  const timestamp = now();
  const conversation: Conversation = {
    id: randomUUID(),
    project_id: input.projectId || null,
    title: normalizeTitle(input.title || ''),
    model: CHAT_MODEL,
    reasoning_effort: input.reasoningEffort || 'medium',
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp,
  };
  db.prepare(`INSERT INTO conversations
    (id, project_id, title, model, reasoning_effort, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    conversation.id, conversation.project_id, conversation.title, conversation.model,
    conversation.reasoning_effort, conversation.archived, conversation.created_at, conversation.updated_at,
  );
  return conversation;
}

export function listConversations(projectId?: string | null, db: Database.Database = getDatabase(), includeArchived = false) {
  if (projectId === undefined) {
    return db.prepare('SELECT * FROM conversations WHERE archived = ? ORDER BY updated_at DESC')
      .all(includeArchived ? 1 : 0) as Conversation[];
  }
  return db.prepare('SELECT * FROM conversations WHERE project_id IS ? AND archived = ? ORDER BY updated_at DESC')
    .all(projectId, includeArchived ? 1 : 0) as Conversation[];
}

export function getConversation(id: string, db: Database.Database = getDatabase()) {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined;
}

export function updateConversation(
  id: string,
  input: { title?: string; projectId?: string | null; reasoningEffort?: ReasoningEffort; archived?: boolean },
  db: Database.Database = getDatabase(),
) {
  const current = getConversation(id, db);
  if (!current) return null;
  const updated: Conversation = {
    ...current,
    title: input.title === undefined ? current.title : normalizeTitle(input.title),
    project_id: input.projectId === undefined ? current.project_id : input.projectId,
    reasoning_effort: input.reasoningEffort || current.reasoning_effort,
    archived: input.archived === undefined ? current.archived : Number(input.archived),
    updated_at: now(),
  };
  db.prepare(`UPDATE conversations SET title = ?, project_id = ?, reasoning_effort = ?, archived = ?, updated_at = ? WHERE id = ?`)
    .run(updated.title, updated.project_id, updated.reasoning_effort, updated.archived, updated.updated_at, id);
  return updated;
}

export function deleteConversation(id: string, db: Database.Database = getDatabase()) {
  return db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
}

export function listMessages(conversationId: string, db: Database.Database = getDatabase()) {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(conversationId) as Message[];
}

export function insertMessage(
  input: { conversationId: string; role: Message['role']; content: string; imageUrl?: string | null; status?: Message['status'] },
  db: Database.Database = getDatabase(),
) {
  const message: Message = {
    id: randomUUID(), conversation_id: input.conversationId, role: input.role,
    content: input.content, image_url: input.imageUrl || null,
    status: input.status || 'complete', created_at: now(),
  };
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, image_url, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    message.id, message.conversation_id, message.role, message.content,
    message.image_url, message.status, message.created_at,
  );
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(message.created_at, input.conversationId);
  return message;
}

export function createImageTask(
  input: { conversationId?: string | null; prompt: string },
  db: Database.Database = getDatabase(),
) {
  const timestamp = now();
  const task: ImageTask = {
    id: randomUUID(), conversation_id: input.conversationId || null, prompt: input.prompt,
    provider_task_id: null, status: 'pending', image_url: null, error: null,
    created_at: timestamp, updated_at: timestamp,
  };
  db.prepare(`INSERT INTO image_generations
    (id, conversation_id, prompt, provider_task_id, status, image_url, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    task.id, task.conversation_id, task.prompt, task.provider_task_id, task.status,
    task.image_url, task.error, task.created_at, task.updated_at,
  );
  return task;
}

export function getImageTask(id: string, db: Database.Database = getDatabase()) {
  return db.prepare('SELECT * FROM image_generations WHERE id = ?').get(id) as ImageTask | undefined;
}

export function listImageTasks(conversationId: string, db: Database.Database = getDatabase()) {
  return db.prepare('SELECT * FROM image_generations WHERE conversation_id = ? ORDER BY created_at DESC')
    .all(conversationId) as ImageTask[];
}

export function updateImageTask(
  id: string,
  input: Partial<Pick<ImageTask, 'provider_task_id' | 'status' | 'image_url' | 'error'>>,
  db: Database.Database = getDatabase(),
) {
  const current = getImageTask(id, db);
  if (!current) return null;
  const updated = { ...current, ...input, updated_at: now() };
  db.prepare(`UPDATE image_generations SET provider_task_id = ?, status = ?, image_url = ?, error = ?, updated_at = ? WHERE id = ?`)
    .run(updated.provider_task_id, updated.status, updated.image_url, updated.error, updated.updated_at, id);
  return updated;
}
