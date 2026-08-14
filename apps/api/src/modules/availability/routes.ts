import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { setAvailabilityStatusSchema, idSchema } from '@lhcc/shared';
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

const dateParam = z.object({ date: z.string().date() });

export const availabilityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/availability/me', async (request) => {
    const session = await requireAuth(request);
    const entries = await availabilityService.listForUser(session.user.id);
    return entries.map(toDto);
  });

  app.put(
    '/api/availability/me/dates/:date',
    { schema: { params: dateParam, body: setAvailabilityStatusSchema } },
    async (request) => {
      const session = await requireAuth(request);
      const updated = await availabilityService.setAvailabilityForDate(
        session.user.id,
        request.params.date,
        request.body.status,
      );
      return toDto(updated);
    },
  );

  app.delete(
    '/api/availability/me/dates/:date',
    { schema: { params: dateParam } },
    async (request, reply) => {
      const session = await requireAuth(request);
      await availabilityService.clearAvailabilityForDate(session.user.id, request.params.date);
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

  app.put(
    '/api/availability/:userId/dates/:date',
    { schema: { params: z.object({ userId: idSchema, date: z.string().date() }), body: setAvailabilityStatusSchema } },
    async (request) => {
      await requireAdmin(request);
      const updated = await availabilityService.setAvailabilityForDate(
        request.params.userId,
        request.params.date,
        request.body.status,
      );
      return toDto(updated);
    },
  );

  app.delete(
    '/api/availability/:userId/dates/:date',
    { schema: { params: z.object({ userId: idSchema, date: z.string().date() }) } },
    async (request, reply) => {
      await requireAdmin(request);
      await availabilityService.clearAvailabilityForDate(request.params.userId, request.params.date);
      reply.status(204);
    },
  );
};
