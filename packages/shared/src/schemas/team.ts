import { z } from 'zod';
import { idSchema } from './common.js';
import { userSummarySchema } from './user.js';

export const teamSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Team = z.infer<typeof teamSchema>;

export const teamWithMemberCountSchema = teamSchema.extend({
  memberCount: z.number().int().nonnegative(),
  isMember: z.boolean().optional(),
});
export type TeamWithMemberCount = z.infer<typeof teamWithMemberCountSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const teamMemberSchema = z.object({
  teamId: idSchema,
  userId: idSchema,
  joinedAt: z.string().datetime(),
  user: userSummarySchema,
});
export type TeamMember = z.infer<typeof teamMemberSchema>;
