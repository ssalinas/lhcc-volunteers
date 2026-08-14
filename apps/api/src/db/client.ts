import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../config/env.js';
import * as authSchema from './schema/auth.schema.js';
import * as coreSchema from './schema/core.schema.js';

const dbDir = dirname(env.DATABASE_PATH);
if (dbDir && dbDir !== '.' && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const schema = { ...authSchema, ...coreSchema };

export const db = drizzle(sqlite, { schema });

export type DbClient = typeof db;
