import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sendScheduleNotificationSchema } from '@lhcc/shared';
import { requireAdmin } from '../../auth/plugin.js';
import { getLastNotifiedByEvent, sendScheduleNotifications } from './service.js';

export const scheduleNotificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/schedule/notify', { schema: { body: sendScheduleNotificationSchema } }, async (request) => {
    const session = await requireAdmin(request);
    return sendScheduleNotifications(request.body.occurrenceIds, session.user.id);
  });

  app.get('/api/admin/schedule-notifications/last-sent', async (request) => {
    await requireAdmin(request);
    const byEvent = await getLastNotifiedByEvent();
    return Object.entries(byEvent).map(([eventId, lastSentAt]) => ({
      eventId,
      lastSentAt: lastSentAt.toISOString(),
    }));
  });
};
