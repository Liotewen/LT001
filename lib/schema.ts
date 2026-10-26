import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#315e4a',
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL CHECK (reasoning_effort IN ('low', 'medium', 'high')),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'complete', 'error')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS image_generations (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      prompt TEXT NOT NULL,
      provider_task_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error')),
      image_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversations_project_updated
      ON conversations(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS messages_conversation_created
      ON messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS images_conversation_created
      ON image_generations(conversation_id, created_at DESC);
  `);

  for (const table of ['projects', 'conversations']) {
    const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'archived')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
    }
  }
}
