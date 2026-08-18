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
