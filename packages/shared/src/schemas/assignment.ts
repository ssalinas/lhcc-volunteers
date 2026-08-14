import { z } from 'zod';
import { assignmentStatusEnum, idSchema } from './common.js';
import { userSummarySchema } from './user.js';

export const assignmentSchema = z.object({
  id: idSchema,
  volunteerRoleId: idSchema,
  userId: idSchema,
  status: assignmentStatusEnum,
  assignedByUserId: idSchema.nullable(),
  assignedAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  user: userSummarySchema.optional(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const createAssignmentSchema = z.object({
  volunteerRoleId: idSchema,
  userId: idSchema,
  force: z.boolean().default(false),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  status: assignmentStatusEnum.optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const autoScheduleGapSchema = z.object({
  volunteerRoleId: idSchema,
  roleName: z.string(),
  slotsNeeded: z.number().int().nonnegative(),
  slotsFilled: z.number().int().nonnegative(),
  reason: z.enum(['no_eligible_members', 'no_one_available', 'all_candidates_exhausted']),
});
export type AutoScheduleGap = z.infer<typeof autoScheduleGapSchema>;

export const autoScheduleResultSchema = z.object({
  occurrenceId: idSchema,
  createdAssignments: z.array(assignmentSchema),
  gaps: z.array(autoScheduleGapSchema),
});
export type AutoScheduleResult = z.infer<typeof autoScheduleResultSchema>;
