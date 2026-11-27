/**
 * Omind v5 — Local Node.js 1-Room-1-SQLite Factory (node:sqlite)
 * Mirrors Cloudflare's 1-Room-1-Durable-Object physical isolation in Node.js & tests.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { initRoomSchema } from './db-core.mjs';

export function createNodeRoomSqlite(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const req = createRequire(import.meta.url);
  const { DatabaseSync } = req('node:sqlite');
  const rawDb = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    rawDb.exec('PRAGMA journal_mode = WAL;');
  }
  rawDb.exec('PRAGMA foreign_keys = ON;');
  initRoomSchema(rawDb);
  return rawDb;
}
