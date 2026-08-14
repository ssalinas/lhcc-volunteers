import { listLocalBackups, runDatabaseBackup } from '../../jobs/backupDb.js';
import { isR2Configured, listR2Backups } from '../../lib/r2.js';

export async function getBackupStatus() {
  const local = listLocalBackups();
  const r2 = isR2Configured() ? await listR2Backups() : [];
  return {
    r2Configured: isR2Configured(),
    local: local.map((f) => ({ name: f.name, createdAt: f.createdAt, sizeBytes: f.sizeBytes })),
    r2: r2.map((f) => ({ name: f.name, createdAt: f.createdAt, sizeBytes: f.sizeBytes })),
  };
}

export async function triggerBackupNow(logger?: Parameters<typeof runDatabaseBackup>[0]) {
  const result = await runDatabaseBackup(logger);
  return { filename: result.filename, uploadedToR2: result.uploadedToR2 };
}
