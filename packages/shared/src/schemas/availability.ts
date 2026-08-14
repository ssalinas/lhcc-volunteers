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

export const upsertAvailabilitySchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    status: availabilityStatusEnum.default('available'),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export type UpsertAvailabilityInput = z.infer<typeof upsertAvailabilitySchema>;
