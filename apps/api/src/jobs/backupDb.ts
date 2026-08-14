import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sqlite } from '../db/client.js';
import { env } from '../config/env.js';
import { isR2Configured, pruneR2Backups, uploadBackupToR2 } from '../lib/r2.js';

const LOCAL_BACKUP_RETENTION_COUNT = 14;

interface BackupLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: unknown, msg: string) => void;
}

export function backupDir(): string {
  return join(dirname(env.DATABASE_PATH), 'backups');
}

export interface LocalBackupFile {
  name: string;
  path: string;
  createdAt: Date;
  sizeBytes: number;
}

export function listLocalBackups(): LocalBackupFile[] {
  const dir = backupDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith('lhcc-') && f.endsWith('.sqlite'))
    .map((f) => {
      const path = join(dir, f);
      const stat = statSync(path);
      return { name: f, path, createdAt: stat.mtime, sizeBytes: stat.size };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Copies the live SQLite database to a dated backup file via better-sqlite3's
 * .backup() API — safe to run against a database in WAL mode while it's in use.
 * Keeps the most recent LOCAL_BACKUP_RETENTION_COUNT files locally, and — if
 * R2 credentials are configured — also uploads it off the Pi to Cloudflare R2
 * and prunes the remote bucket down to R2_BACKUP_RETENTION_COUNT.
 */
export async function runDatabaseBackup(logger?: BackupLogger) {
  const dir = backupDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `lhcc-${stamp}.sqlite`;
  const destination = join(dir, filename);

  await sqlite.backup(destination);
  logger?.info({ destination }, 'Database backup complete');

  const files = listLocalBackups();
  for (const stale of files.slice(LOCAL_BACKUP_RETENTION_COUNT)) {
    unlinkSync(stale.path);
    logger?.info({ file: stale.name }, 'Pruned old local database backup');
  }

  let uploadedToR2 = false;
  if (isR2Configured()) {
    try {
      await uploadBackupToR2(destination, filename);
      uploadedToR2 = true;
      logger?.info({ filename }, 'Uploaded database backup to Cloudflare R2');
      const pruned = await pruneR2Backups(env.R2_BACKUP_RETENTION_COUNT);
      if (pruned.length > 0) logger?.info({ pruned }, 'Pruned old R2 database backups');
    } catch (err) {
      logger?.error?.(err, 'Failed to upload database backup to Cloudflare R2');
    }
  }

  return {
    destination,
    filename,
    retainedLocal: Math.min(files.length, LOCAL_BACKUP_RETENTION_COUNT),
    uploadedToR2,
  };
}
