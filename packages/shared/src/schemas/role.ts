import { z } from 'zod';
import { idSchema } from './common.js';

export const volunteerRoleSchema = z.object({
  id: idSchema,
  eventOccurrenceId: idSchema,
  teamId: idSchema,
  teamName: z.string(),
  name: z.string(),
  slotsCount: z.number().int().positive(),
  stackable: z.boolean(),
  sourceTemplateId: idSchema.nullable(),
});
export type VolunteerRole = z.infer<typeof volunteerRoleSchema>;

export const createVolunteerRoleSchema = z.object({
  teamId: idSchema,
  name: z.string().min(1),
  slotsCount: z.number().int().positive().default(1),
  stackable: z.boolean().default(false),
});
export type CreateVolunteerRoleInput = z.infer<typeof createVolunteerRoleSchema>;

export const eligibleCandidateSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string().email(),
  assignmentCountInWindow: z.number().int().nonnegative(),
  lastServedAt: z.string().datetime().nullable(),
  alreadyUsedInOccurrence: z.boolean(),
  available: z.boolean(),
  recentlyServedSameEvent: z.boolean(),
});
export type EligibleCandidate = z.infer<typeof eligibleCandidateSchema>;
