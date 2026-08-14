import { z } from 'zod';
import { idSchema } from './common.js';

export const volunteerHistoryEntrySchema = z.object({
  userId: idSchema,
  userName: z.string(),
  teamId: idSchema,
  teamName: z.string(),
  totalAssignments: z.number().int().nonnegative(),
  lastServedAt: z.string().datetime().nullable(),
});
export type VolunteerHistoryEntry = z.infer<typeof volunteerHistoryEntrySchema>;

export const teamSummaryEntrySchema = z.object({
  teamId: idSchema,
  teamName: z.string(),
  memberCount: z.number().int().nonnegative(),
  assignmentsInWindow: z.number().int().nonnegative(),
  distinctVolunteersInWindow: z.number().int().nonnegative(),
});
export type TeamSummaryEntry = z.infer<typeof teamSummaryEntrySchema>;

export const coverageGapEntrySchema = z.object({
  occurrenceId: idSchema,
  eventName: z.string(),
  startAt: z.string().datetime(),
  roleName: z.string(),
  slotsNeeded: z.number().int().nonnegative(),
  slotsFilled: z.number().int().nonnegative(),
});
export type CoverageGapEntry = z.infer<typeof coverageGapEntrySchema>;
