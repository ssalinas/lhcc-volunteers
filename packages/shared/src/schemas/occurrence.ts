import { z } from 'zod';
import { idSchema, occurrenceStatusEnum } from './common.js';
import { volunteerRoleSchema } from './role.js';
import { assignmentSchema } from './assignment.js';

export const occurrenceSummarySchema = z.object({
  id: idSchema,
  eventId: idSchema,
  eventName: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  status: occurrenceStatusEnum,
  location: z.string().nullable(),
  isMineAssigned: z.boolean(),
  totalSlots: z.number().int().nonnegative(),
  filledSlots: z.number().int().nonnegative(),
  teamNames: z.array(z.string()),
});
export type OccurrenceSummary = z.infer<typeof occurrenceSummarySchema>;

export const occurrenceDetailSchema = occurrenceSummarySchema.extend({
  notes: z.string().nullable(),
  roles: z.array(
    volunteerRoleSchema.extend({
      assignments: z.array(assignmentSchema),
    }),
  ),
});
export type OccurrenceDetail = z.infer<typeof occurrenceDetailSchema>;

export const updateOccurrenceSchema = z.object({
  status: occurrenceStatusEnum.optional(),
  locationOverride: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
});
export type UpdateOccurrenceInput = z.infer<typeof updateOccurrenceSchema>;
