import { z } from 'zod';
import { idSchema } from './common.js';

export const sendScheduleNotificationSchema = z.object({
  occurrenceIds: z.array(idSchema).min(1),
});
export type SendScheduleNotificationInput = z.infer<typeof sendScheduleNotificationSchema>;

export const scheduleNotificationResultSchema = z.object({
  batchId: idSchema,
  recipientCount: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative(),
});
export type ScheduleNotificationResult = z.infer<typeof scheduleNotificationResultSchema>;

export const runAvailabilityRemindersNowResultSchema = z.object({
  remindersSent: z.number().int().nonnegative(),
});
export type RunAvailabilityRemindersNowResult = z.infer<typeof runAvailabilityRemindersNowResultSchema>;

export const availabilityReminderStatusSchema = z.object({
  lastSentAt: z.string().datetime().nullable(),
  remindersSent: z.number().int().nonnegative().nullable(),
  triggeredBy: z.enum(['cron', 'manual']).nullable(),
});
export type AvailabilityReminderStatus = z.infer<typeof availabilityReminderStatusSchema>;

export const eventLastNotifiedSchema = z.object({
  eventId: idSchema,
  lastSentAt: z.string().datetime(),
});
export type EventLastNotified = z.infer<typeof eventLastNotifiedSchema>;
