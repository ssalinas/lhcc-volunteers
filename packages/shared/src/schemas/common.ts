import { z } from 'zod';

// Not constrained to UUID format: our own domain tables use randomUUID(), but
// better-auth generates its own (non-UUID) IDs for user/session/account/verification.
export const idSchema = z.string().min(1);

export const userRoleEnum = z.enum(['admin', 'volunteer']);
export type UserRole = z.infer<typeof userRoleEnum>;

export const availabilityStatusEnum = z.enum(['available', 'unavailable']);
export type AvailabilityStatus = z.infer<typeof availabilityStatusEnum>;

export const occurrenceStatusEnum = z.enum(['scheduled', 'canceled']);
export type OccurrenceStatus = z.infer<typeof occurrenceStatusEnum>;

export const assignmentStatusEnum = z.enum(['scheduled', 'confirmed', 'declined', 'completed']);
export type AssignmentStatus = z.infer<typeof assignmentStatusEnum>;

export const dateRangeQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
