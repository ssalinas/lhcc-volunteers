import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sqlite } from '../db/client.js';
import { env } from '../config/env.js';

const BACKUP_RETENTION_COUNT = 14;

interface BackupLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
}

function backupDir(): string {
  return join(dirname(env.DATABASE_PATH), 'backups');
}

/**
 * Copies the live SQLite database to a dated backup file via better-sqlite3's
 * .backup() API — safe to run against a database in WAL mode while it's in use.
 * Keeps the most recent BACKUP_RETENTION_COUNT files and prunes older ones.
 */
export async function runDatabaseBackup(logger?: BackupLogger) {
  const dir = backupDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = join(dir, `lhcc-${stamp}.sqlite`);

  await sqlite.backup(destination);
  logger?.info({ destination }, 'Database backup complete');

  const files = readdirSync(dir)
    .filter((f) => f.startsWith('lhcc-') && f.endsWith('.sqlite'))
    .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const stale of files.slice(BACKUP_RETENTION_COUNT)) {
    unlinkSync(stale.path);
    logger?.info({ file: stale.name }, 'Pruned old database backup');
  }

  return { destination, retained: Math.min(files.length, BACKUP_RETENTION_COUNT) };
}
