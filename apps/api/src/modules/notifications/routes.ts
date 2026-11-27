import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { setAvailabilityRemindersAutomaticSchema, type AvailabilityReminderStatus } from '@lhcc/shared';
import { requireAdmin } from '../../auth/plugin.js';
import * as notificationsService from './service.js';

function toStatusDto(status: Awaited<ReturnType<typeof notificationsService.getAvailabilityReminderStatus>>): AvailabilityReminderStatus {
  return {
    lastSentAt: status.lastSentAt ? status.lastSentAt.toISOString() : null,
    remindersSent: status.remindersSent,
    triggeredBy: status.triggeredBy,
    automaticEnabled: status.automatic.enabled,
    automaticChangedAt: status.automatic.changedAt ? status.automatic.changedAt.toISOString() : null,
    automaticChangedBy: status.automatic.changedBy,
  };
}

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/admin/availability-reminders/send-now', async (request) => {
    await requireAdmin(request);
    return notificationsService.triggerAvailabilityRemindersNow(app.log);
  });

  app.get('/api/admin/availability-reminders/status', async (request) => {
    await requireAdmin(request);
    return toStatusDto(await notificationsService.getAvailabilityReminderStatus());
  });

  // On/off switch for the daily automatic reminder job (jobs/sendAvailabilityReminders.ts).
  app.put(
    '/api/admin/availability-reminders/automatic',
    { schema: { body: setAvailabilityRemindersAutomaticSchema } },
    async (request) => {
      const session = await requireAdmin(request);
      return toStatusDto(
        await notificationsService.setAutomaticAvailabilityReminders(request.body.enabled, session.user.id),
      );
    },
  );
};
