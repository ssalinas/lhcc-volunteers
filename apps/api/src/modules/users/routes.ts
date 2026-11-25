import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createUserSchema,
  updateUserSchema,
  updateMyPreferencesSchema,
  userSummarySchema,
  idSchema,
  sendWelcomeEmailResultSchema,
  loginOptionsSchema,
} from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as usersService from './service.js';
import { sendWelcomeEmail } from './welcomeEmail.js';
import { isMailerConfigured } from '../../lib/mailer.js';
import { env } from '../../config/env.js';

function toSummary(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone: string | null;
  receiveAvailabilityReminders: boolean;
  welcomeEmailSentAt?: Date | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as 'admin' | 'volunteer',
    active: u.active,
    phone: u.phone,
    receiveAvailabilityReminders: u.receiveAvailabilityReminders,
    welcomeEmailSentAt: u.welcomeEmailSentAt ? u.welcomeEmailSentAt.toISOString() : null,
  };
}

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  // Public — the login page asks which sign-in options to show. The email-link option only
  // works when outbound email is configured (lib/mailer.ts), so it's hidden otherwise.
  app.get('/api/login-options', { schema: { response: { 200: loginOptionsSchema } } }, async () => ({
    emailLink: isMailerConfigured() || env.NODE_ENV !== 'production',
    google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  }));

  // Deliberately a manual, per-person button (Users page) rather than automatic on create.
  app.post(
    '/api/admin/users/:id/send-welcome',
    { schema: { params: z.object({ id: idSchema }), response: { 200: sendWelcomeEmailResultSchema } } },
    async (request) => {
      await requireAdmin(request);
      const sentAt = await sendWelcomeEmail(request.params.id);
      return { sentAt: sentAt.toISOString() };
    },
  );

  app.get('/api/me', async (request) => {
    const session = await requireAuth(request);
    const full = await usersService.getUser(session.user.id);
    return toSummary(full);
  });

  app.patch(
    '/api/me/preferences',
    { schema: { body: updateMyPreferencesSchema, response: { 200: userSummarySchema } } },
    async (request) => {
      const session = await requireAuth(request);
      const updated = await usersService.updateUser(session.user.id, request.body);
      return toSummary(updated);
    },
  );

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

  app.delete(
    '/api/admin/users/:id',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request, reply) => {
      const session = await requireAdmin(request);
      await usersService.deleteUser(request.params.id, session.user.id);
      reply.status(204);
    },
  );
};
