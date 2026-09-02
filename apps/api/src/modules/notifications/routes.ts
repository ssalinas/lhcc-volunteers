import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin } from '../../auth/plugin.js';
import * as notificationsService from './service.js';

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/admin/availability-reminders/send-now', async (request) => {
    await requireAdmin(request);
    return notificationsService.triggerAvailabilityRemindersNow(app.log);
  });
};
