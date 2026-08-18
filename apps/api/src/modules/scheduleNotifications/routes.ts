import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sendScheduleNotificationSchema } from '@lhcc/shared';
import { requireAdmin } from '../../auth/plugin.js';
import { sendScheduleNotifications } from './service.js';

export const scheduleNotificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/schedule/notify', { schema: { body: sendScheduleNotificationSchema } }, async (request) => {
    const session = await requireAdmin(request);
    return sendScheduleNotifications(request.body.occurrenceIds, session.user.id);
  });
};
