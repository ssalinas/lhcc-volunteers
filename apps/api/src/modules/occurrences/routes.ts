import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createVolunteerRoleSchema, dateRangeQuerySchema, idSchema, updateOccurrenceSchema } from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as occurrencesService from './service.js';
import { getFairnessRankedCandidates } from '../scheduling/fairness.js';
import { autoScheduleOccurrence } from '../scheduling/autoSchedule.js';
import { db } from '../../db/client.js';
import { volunteerRoles } from '../../db/schema/core.schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '../../lib/http-errors.js';

function toAssignmentDto(a: {
  id: string;
  volunteerRoleId: string;
  userId: string;
  status: string;
  assignedByUserId: string | null;
  assignedAt: Date;
  respondedAt: Date | null;
  notes: string | null;
  user?: { id: string; name: string; email: string; role: string; active: boolean; phone: string | null };
}) {
  return {
    id: a.id,
    volunteerRoleId: a.volunteerRoleId,
    userId: a.userId,
    status: a.status as 'scheduled' | 'confirmed' | 'declined' | 'completed',
    assignedByUserId: a.assignedByUserId,
    assignedAt: a.assignedAt.toISOString(),
    respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
    notes: a.notes,
    user: a.user
      ? {
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          role: a.user.role as 'admin' | 'volunteer',
          active: a.user.active,
          phone: a.user.phone,
        }
      : undefined,
  };
}

export const occurrencesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/occurrences', { schema: { querystring: dateRangeQuerySchema } }, async (request) => {
    const session = await requireAuth(request);
    const { from, to } = request.query;
    return occurrencesService.listOccurrences(new Date(from), new Date(to), session.user.id);
  });

  app.get(
    '/api/occurrences/:id',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request) => {
      const session = await requireAuth(request);
      const occurrence = await occurrencesService.getOccurrence(request.params.id);
      const totalSlots = occurrence.roles.reduce((sum, r) => sum + r.slotsCount, 0);
      const filledSlots = occurrence.roles.reduce(
        (sum, r) => sum + r.assignments.filter((a) => a.status !== 'declined').length,
        0,
      );
      const isMineAssigned = occurrence.roles.some((r) =>
        r.assignments.some((a) => a.userId === session.user.id && a.status !== 'declined'),
      );
      return {
        id: occurrence.id,
        eventId: occurrence.eventId,
        eventName: occurrence.event.name,
        startAt: occurrence.startAt.toISOString(),
        endAt: occurrence.endAt.toISOString(),
        status: occurrence.status,
        location: occurrence.locationOverride ?? occurrence.event.location,
        notes: occurrence.notes,
        isMineAssigned,
        totalSlots,
        filledSlots,
        roles: occurrence.roles.map((r) => ({
          id: r.id,
          eventOccurrenceId: r.eventOccurrenceId,
          teamId: r.teamId,
          name: r.name,
          slotsCount: r.slotsCount,
          stackable: r.stackable,
          sourceTemplateId: r.sourceTemplateId,
          assignments: r.assignments.map(toAssignmentDto),
        })),
      };
    },
  );

  app.patch(
    '/api/occurrences/:id',
    { schema: { params: z.object({ id: idSchema }), body: updateOccurrenceSchema } },
    async (request) => {
      await requireAdmin(request);
      await occurrencesService.updateOccurrence(request.params.id, request.body);
      return { ok: true };
    },
  );

  app.post(
    '/api/occurrences/:id/roles',
    { schema: { params: z.object({ id: idSchema }), body: createVolunteerRoleSchema } },
    async (request, reply) => {
      await requireAdmin(request);
      const created = await occurrencesService.addAdHocRole(request.params.id, request.body);
      reply.status(201);
      return created;
    },
  );

  app.get(
    '/api/occurrences/:id/eligible-candidates',
    {
      schema: {
        params: z.object({ id: idSchema }),
        querystring: z.object({ roleId: idSchema }),
      },
    },
    async (request) => {
      await requireAdmin(request);
      const role = await db.query.volunteerRoles.findFirst({ where: eq(volunteerRoles.id, request.query.roleId) });
      if (!role || role.eventOccurrenceId !== request.params.id) throw new NotFoundError('Role not found');
      const occurrence = await occurrencesService.getOccurrence(request.params.id);
      const candidates = await getFairnessRankedCandidates(role.teamId, occurrence.id, occurrence.startAt);
      return candidates.map((c) => ({
        ...c,
        lastServedAt: c.lastServedAt ? c.lastServedAt.toISOString() : null,
      }));
    },
  );

  app.post(
    '/api/occurrences/:id/auto-schedule',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request) => {
      const session = await requireAdmin(request);
      const result = await autoScheduleOccurrence(request.params.id, session.user.id);
      return {
        occurrenceId: result.occurrenceId,
        createdAssignments: result.createdAssignments.map(toAssignmentDto),
        gaps: result.gaps,
      };
    },
  );
};
