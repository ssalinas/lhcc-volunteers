import { z } from 'zod';
import { idSchema, userRoleEnum } from './common.js';

export const userSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string().email(),
  role: userRoleEnum,
  active: z.boolean(),
  phone: z.string().nullable().optional(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: userRoleEnum.default('volunteer'),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: userRoleEnum.optional(),
  active: z.boolean().optional(),
  phone: z.string().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
