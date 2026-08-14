import { z } from 'zod';
import { availabilityStatusEnum, idSchema } from './common.js';

export const availabilityEntrySchema = z.object({
  id: idSchema,
  userId: idSchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  status: availabilityStatusEnum,
  createdAt: z.string().datetime(),
});
export type AvailabilityEntry = z.infer<typeof availabilityEntrySchema>;

// Availability is set per specific upcoming date (checkbox-style), not a freeform
// date range — this keeps "available" / "unavailable" / "hasn't responded" distinguishable.
export const setAvailabilityStatusSchema = z.object({
  status: availabilityStatusEnum,
});
export type SetAvailabilityStatusInput = z.infer<typeof setAvailabilityStatusSchema>;
