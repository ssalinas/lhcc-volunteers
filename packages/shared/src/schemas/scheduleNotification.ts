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
  /** Whether the daily automatic reminder job is allowed to send. "Send now" works either way. */
  automaticEnabled: z.boolean(),
  /** When/by whom the switch was last flipped; null if it's never been changed (default: on). */
  automaticChangedAt: z.string().datetime().nullable(),
  automaticChangedBy: z.string().nullable(),
});
export type AvailabilityReminderStatus = z.infer<typeof availabilityReminderStatusSchema>;

export const setAvailabilityRemindersAutomaticSchema = z.object({
  enabled: z.boolean(),
});
export type SetAvailabilityRemindersAutomaticInput = z.infer<typeof setAvailabilityRemindersAutomaticSchema>;

export const eventLastNotifiedSchema = z.object({
  eventId: idSchema,
  lastSentAt: z.string().datetime(),
});
export type EventLastNotified = z.infer<typeof eventLastNotifiedSchema>;
