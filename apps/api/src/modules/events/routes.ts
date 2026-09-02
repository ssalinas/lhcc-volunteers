import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createEventSchema,
  createEventRoleTemplateSchema,
  updateEventSchema,
  autoScheduleRangeSchema,
  idSchema,
} from '@lhcc/shared';
import { requireAdmin } from '../../auth/plugin.js';
import * as eventsService from './service.js';
import { listOccurrenceIdsForEvent } from '../occurrences/service.js';
import { toAssignmentDto } from '../occurrences/routes.js';
import { autoScheduleOccurrence } from '../scheduling/autoSchedule.js';

function toRoleTemplateDto(t: {
  id: string;
  eventId: string;
  teamId: string;
  name: string;
  slotsCount: number;
  stackable: boolean;
  sortOrder: number;
}) {
  return t;
}

function toEventDto(e: {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  defaultStartTime: string;
  defaultDurationMinutes: number;
  timezone: string;
  isRecurring: boolean;
  rrule: string | null;
  dtstart: Date | null;
  recurrenceEndDate: string | null;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  roleTemplates?: ReturnType<typeof toRoleTemplateDto>[];
}) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    location: e.location,
    defaultStartTime: e.defaultStartTime,
    defaultDurationMinutes: e.defaultDurationMinutes,
    timezone: e.timezone,
    isRecurring: e.isRecurring,
    rrule: e.rrule,
    dtstart: e.dtstart ? e.dtstart.toISOString() : null,
    recurrenceEndDate: e.recurrenceEndDate,
    active: e.active,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    roleTemplates: e.roleTemplates,
  };
}

export const eventsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/events', async (request) => {
    await requireAdmin(request);
    const evts = await eventsService.listEvents();
    return evts.map((e) => toEventDto(e));
  });

  app.get('/api/events/:id', { schema: { params: z.object({ id: idSchema }) } }, async (request) => {
    await requireAdmin(request);
    const event = await eventsService.getEvent(request.params.id);
    return toEventDto(event);
  });

  app.post('/api/events', { schema: { body: createEventSchema } }, async (request, reply) => {
    const session = await requireAdmin(request);
    const created = await eventsService.createEvent(request.body, session.user.id);
    reply.status(201);
    return toEventDto(created);
  });

  app.patch(
    '/api/events/:id',
    { schema: { params: z.object({ id: idSchema }), body: updateEventSchema } },
    async (request) => {
      await requireAdmin(request);
      const updated = await eventsService.updateEvent(request.params.id, request.body);
      return toEventDto(updated);
    },
  );

  app.delete('/api/events/:id', { schema: { params: z.object({ id: idSchema }) } }, async (request, reply) => {
    await requireAdmin(request);
    await eventsService.archiveEvent(request.params.id);
    reply.status(204);
  });

  app.post(
    '/api/events/:id/role-templates',
    { schema: { params: z.object({ id: idSchema }), body: createEventRoleTemplateSchema } },
    async (request, reply) => {
      await requireAdmin(request);
      const created = await eventsService.createRoleTemplate(request.params.id, request.body);
      reply.status(201);
      return toRoleTemplateDto(created);
    },
  );

  app.delete(
    '/api/events/:id/role-templates/:templateId',
    { schema: { params: z.object({ id: idSchema, templateId: idSchema }) } },
    async (request, reply) => {
      await requireAdmin(request);
      await eventsService.deleteRoleTemplate(request.params.id, request.params.templateId);
      reply.status(204);
    },
  );

  app.post(
    '/api/events/:id/regenerate-occurrences',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request) => {
      await requireAdmin(request);
      return eventsService.regenerateOccurrences(request.params.id);
    },
  );

  app.post(
    '/api/events/:id/auto-schedule-range',
    { schema: { params: z.object({ id: idSchema }), body: autoScheduleRangeSchema } },
    async (request) => {
      const session = await requireAdmin(request);
      const { from, to, roleNames } = request.body;
      const occurrenceIds = await listOccurrenceIdsForEvent(request.params.id, new Date(from), new Date(to));

      // Sequential, not parallel: each call's fairness ranking depends on assignments made by
      // earlier calls in this same run, exactly as it already does across one occurrence's roles.
      const results = [];
      for (const occurrenceId of occurrenceIds) {
        const result = await autoScheduleOccurrence(occurrenceId, session.user.id, roleNames);
        results.push({
          occurrenceId: result.occurrenceId,
          createdAssignments: result.createdAssignments.map(toAssignmentDto),
          gaps: result.gaps,
        });
      }

      return { eventId: request.params.id, results };
    },
  );
};
