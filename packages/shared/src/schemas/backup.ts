import { z } from 'zod';

export const backupFileSchema = z.object({
  name: z.string(),
  createdAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative(),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

export const backupStatusSchema = z.object({
  r2Configured: z.boolean(),
  local: z.array(backupFileSchema),
  r2: z.array(backupFileSchema),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const runBackupResultSchema = z.object({
  filename: z.string(),
  uploadedToR2: z.boolean(),
});
export type RunBackupResult = z.infer<typeof runBackupResultSchema>;
