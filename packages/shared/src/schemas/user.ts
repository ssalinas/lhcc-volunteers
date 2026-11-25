import { z } from 'zod';
import { idSchema, userRoleEnum } from './common.js';

export const userSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string().email(),
  role: userRoleEnum,
  active: z.boolean(),
  phone: z.string().nullable().optional(),
  receiveAvailabilityReminders: z.boolean(),
  welcomeEmailSentAt: z.string().datetime().nullable().optional(),
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
  receiveAvailabilityReminders: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateMyPreferencesSchema = z.object({
  receiveAvailabilityReminders: z.boolean(),
});
export type UpdateMyPreferencesInput = z.infer<typeof updateMyPreferencesSchema>;

export const sendWelcomeEmailResultSchema = z.object({ sentAt: z.string().datetime() });
export type SendWelcomeEmailResult = z.infer<typeof sendWelcomeEmailResultSchema>;

/** Public: which sign-in methods the login page should offer (depends on server config). */
export const loginOptionsSchema = z.object({ emailLink: z.boolean(), google: z.boolean() });
export type LoginOptions = z.infer<typeof loginOptionsSchema>;
