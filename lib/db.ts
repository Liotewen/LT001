import SqliteDatabase from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { initializeSchema } from '@/lib/schema';

type WorkspaceGlobal = typeof globalThis & {
  __ltWorkspaceDb?: SqliteDatabase.Database;
  __ltWorkspaceDbPath?: string;
};

function ensureParent(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
}

export function openDatabase(path: string) {
  ensureParent(path);
  const db = new SqliteDatabase(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  initializeSchema(db);
  return db;
}

export function getDatabase() {
  const global = globalThis as WorkspaceGlobal;
  const configured = process.env.DATABASE_PATH || './data/app.db';
  const path = configured === ':memory:' ? configured : resolve(configured);
  if (global.__ltWorkspaceDb && global.__ltWorkspaceDbPath === path) return global.__ltWorkspaceDb;
  if (global.__ltWorkspaceDb) global.__ltWorkspaceDb.close();
  global.__ltWorkspaceDb = openDatabase(path);
  global.__ltWorkspaceDbPath = path;
  return global.__ltWorkspaceDb;
}
