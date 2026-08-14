import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createUserSchema, updateUserSchema, userSummarySchema, idSchema } from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as usersService from './service.js';

function toSummary(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone: string | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as 'admin' | 'volunteer',
    active: u.active,
    phone: u.phone,
  };
}

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/me', async (request) => {
    const session = await requireAuth(request);
    const full = await usersService.getUser(session.user.id);
    return toSummary(full);
  });

  app.get(
    '/api/admin/users',
    { schema: { response: { 200: z.array(userSummarySchema) } } },
    async (request) => {
      await requireAdmin(request);
      const users = await usersService.listUsers();
      return users.map(toSummary);
    },
  );

  app.post(
    '/api/admin/users',
    { schema: { body: createUserSchema, response: { 201: userSummarySchema } } },
    async (request, reply) => {
      await requireAdmin(request);
      const created = await usersService.createUser(request.body);
      reply.status(201);
      return toSummary(created);
    },
  );

  app.patch(
    '/api/admin/users/:id',
    { schema: { params: z.object({ id: idSchema }), body: updateUserSchema } },
    async (request) => {
      await requireAdmin(request);
      const updated = await usersService.updateUser(request.params.id, request.body);
      return toSummary(updated);
    },
  );
};
