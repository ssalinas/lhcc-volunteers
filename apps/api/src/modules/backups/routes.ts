import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin } from '../../auth/plugin.js';
import * as backupsService from './service.js';

function toFileDto(f: { name: string; createdAt: Date; sizeBytes: number }) {
  return { name: f.name, createdAt: f.createdAt.toISOString(), sizeBytes: f.sizeBytes };
}

export const backupsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/admin/backups', async (request) => {
    await requireAdmin(request);
    const status = await backupsService.getBackupStatus();
    return {
      r2Configured: status.r2Configured,
      local: status.local.map(toFileDto),
      r2: status.r2.map(toFileDto),
    };
  });

  app.post('/api/admin/backups/run', async (request) => {
    await requireAdmin(request);
    return backupsService.triggerBackupNow(app.log);
  });
};
