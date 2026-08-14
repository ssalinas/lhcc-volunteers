import { readFileSync } from 'node:fs';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const BACKUP_PREFIX = 'backups/';

let client: S3Client | undefined;

// R2 is S3-compatible — same SDK as AWS, pointed at the account's R2 endpoint with an
// R2 API token (Access Key ID + Secret) instead of AWS credentials. See README for setup.
function getClient(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export function isR2Configured(): boolean {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
}

export interface R2BackupObject {
  name: string;
  createdAt: Date;
  sizeBytes: number;
}

export async function uploadBackupToR2(localPath: string, filename: string): Promise<void> {
  if (!isR2Configured()) return;
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: `${BACKUP_PREFIX}${filename}`,
      Body: readFileSync(localPath),
    }),
  );
}

export async function listR2Backups(): Promise<R2BackupObject[]> {
  if (!isR2Configured()) return [];
  const result = await getClient().send(
    new ListObjectsV2Command({ Bucket: env.R2_BUCKET_NAME!, Prefix: BACKUP_PREFIX }),
  );
  return (result.Contents ?? [])
    .filter((obj): obj is typeof obj & { Key: string } => !!obj.Key && obj.Key !== BACKUP_PREFIX)
    .map((obj) => ({
      name: obj.Key.slice(BACKUP_PREFIX.length),
      createdAt: obj.LastModified ?? new Date(),
      sizeBytes: obj.Size ?? 0,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Deletes all but the `retentionCount` most recent remote backups. Returns the names removed. */
export async function pruneR2Backups(retentionCount: number): Promise<string[]> {
  if (!isR2Configured()) return [];
  const backups = await listR2Backups();
  const stale = backups.slice(retentionCount);
  for (const s of stale) {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME!, Key: `${BACKUP_PREFIX}${s.name}` }));
  }
  return stale.map((s) => s.name);
}
