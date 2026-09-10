import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin } from '../../auth/plugin.js';
import * as notificationsService from './service.js';

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/admin/availability-reminders/send-now', async (request) => {
    await requireAdmin(request);
    return notificationsService.triggerAvailabilityRemindersNow(app.log);
  });

  app.get('/api/admin/availability-reminders/status', async (request) => {
    await requireAdmin(request);
    const status = await notificationsService.getAvailabilityReminderStatus();
    return {
      lastSentAt: status.lastSentAt ? status.lastSentAt.toISOString() : null,
      remindersSent: status.remindersSent,
      triggeredBy: status.triggeredBy,
    };
  });
};
