import { z } from 'zod';
import { availabilityStatusEnum, idSchema } from './common.js';

// ---------- Login-free email-link responses (/respond page, /api/respond/:token) ----------

export const respondDateSchema = z.object({
  date: z.string().date(),
  eventNames: z.array(z.string()),
  status: availabilityStatusEnum.nullable(),
});
export type RespondDate = z.infer<typeof respondDateSchema>;

export const respondPageSchema = z.object({
  firstName: z.string(),
  email: z.string(),
  dates: z.array(respondDateSchema),
});
export type RespondPage = z.infer<typeof respondPageSchema>;

// ---------- Admin "who hasn't responded" grid ----------

export const availabilityGridSchema = z.object({
  dates: z.array(z.object({ date: z.string().date(), eventNames: z.array(z.string()) })),
  users: z.array(
    z.object({
      userId: idSchema,
      name: z.string(),
      /** Only dates where one of the user's teams is needed. Missing key = not relevant to them. */
      statuses: z.record(z.string(), availabilityStatusEnum.nullable()),
    }),
  ),
});
export type AvailabilityGrid = z.infer<typeof availabilityGridSchema>;
