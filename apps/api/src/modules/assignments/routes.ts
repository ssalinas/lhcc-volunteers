import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createAssignmentSchema, idSchema, updateAssignmentSchema } from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as assignmentsService from './service.js';

export const assignmentsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/api/assignments', { schema: { body: createAssignmentSchema } }, async (request, reply) => {
    const session = await requireAdmin(request);
    const created = await assignmentsService.createAssignment(request.body, session.user.id);
    reply.status(201);
    return created;
  });

  app.patch(
    '/api/assignments/:id',
    { schema: { params: z.object({ id: idSchema }), body: updateAssignmentSchema } },
    async (request) => {
      await requireAdmin(request);
      return assignmentsService.updateAssignment(request.params.id, request.body);
    },
  );

  app.delete(
    '/api/assignments/:id',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request, reply) => {
      await requireAdmin(request);
      await assignmentsService.deleteAssignment(request.params.id);
      reply.status(204);
    },
  );

  app.get('/api/assignments/mine', async (request) => {
    const session = await requireAuth(request);
    const mine = await assignmentsService.listMine(session.user.id);
    return mine.map((a) => ({
      id: a.id,
      status: a.status,
      volunteerRoleId: a.volunteerRoleId,
      roleName: a.volunteerRole.name,
      occurrenceId: a.volunteerRole.occurrence.id,
      eventName: a.volunteerRole.occurrence.event.name,
      startAt: a.volunteerRole.occurrence.startAt.toISOString(),
    }));
  });
};
