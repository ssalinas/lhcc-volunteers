import { z } from 'zod';
import { idSchema } from './common.js';

export const eventRoleTemplateSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  teamId: idSchema,
  name: z.string(),
  slotsCount: z.number().int().positive(),
  stackable: z.boolean(),
  sortOrder: z.number().int(),
});
export type EventRoleTemplate = z.infer<typeof eventRoleTemplateSchema>;

export const createEventRoleTemplateSchema = z.object({
  teamId: idSchema,
  name: z.string().min(1),
  slotsCount: z.number().int().positive().default(1),
  stackable: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type CreateEventRoleTemplateInput = z.infer<typeof createEventRoleTemplateSchema>;

export const eventSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  defaultStartTime: z.string(), // "HH:mm"
  defaultDurationMinutes: z.number().int().positive(),
  timezone: z.string(),
  isRecurring: z.boolean(),
  rrule: z.string().nullable(),
  dtstart: z.string().datetime().nullable(),
  recurrenceEndDate: z.string().date().nullable(),
  active: z.boolean(),
  createdBy: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  roleTemplates: z.array(eventRoleTemplateSchema).optional(),
});
export type Event = z.infer<typeof eventSchema>;

const baseEventFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  defaultStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  defaultDurationMinutes: z.number().int().positive().default(60),
  timezone: z.string().default('America/New_York'),
};

export const createOneOffEventSchema = z.object({
  ...baseEventFields,
  isRecurring: z.literal(false).default(false),
  occurrenceDate: z.string().date(),
  roleTemplates: z.array(createEventRoleTemplateSchema).default([]),
});
export type CreateOneOffEventInput = z.infer<typeof createOneOffEventSchema>;

export const createRecurringEventSchema = z.object({
  ...baseEventFields,
  isRecurring: z.literal(true),
  rrule: z.string().min(1),
  dtstart: z.string().datetime(),
  recurrenceEndDate: z.string().date().optional(),
  roleTemplates: z.array(createEventRoleTemplateSchema).default([]),
});
export type CreateRecurringEventInput = z.infer<typeof createRecurringEventSchema>;

export const createEventSchema = z.discriminatedUnion('isRecurring', [
  createOneOffEventSchema,
  createRecurringEventSchema,
]);
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  defaultStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  rrule: z.string().optional(),
  recurrenceEndDate: z.string().date().nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
