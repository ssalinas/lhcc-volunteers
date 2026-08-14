import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { upsertAvailabilitySchema, idSchema } from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as availabilityService from './service.js';

function toDto(e: { id: string; userId: string; startDate: string; endDate: string; status: string; createdAt: Date }) {
  return {
    id: e.id,
    userId: e.userId,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status as 'available' | 'unavailable',
    createdAt: e.createdAt.toISOString(),
  };
}

export const availabilityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/availability/me', async (request) => {
    const session = await requireAuth(request);
    const entries = await availabilityService.listForUser(session.user.id);
    return entries.map(toDto);
  });

  app.put(
    '/api/availability/me',
    { schema: { body: upsertAvailabilitySchema } },
    async (request, reply) => {
      const session = await requireAuth(request);
      const created = await availabilityService.createEntry(session.user.id, request.body);
      reply.status(201);
      return toDto(created);
    },
  );

  app.delete(
    '/api/availability/me/:id',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request, reply) => {
      const session = await requireAuth(request);
      await availabilityService.deleteEntry(session.user.id, request.params.id);
      reply.status(204);
    },
  );

  app.get(
    '/api/availability/:userId',
    { schema: { params: z.object({ userId: idSchema }) } },
    async (request) => {
      await requireAdmin(request);
      const entries = await availabilityService.listForUser(request.params.userId);
      return entries.map(toDto);
    },
  );
};
