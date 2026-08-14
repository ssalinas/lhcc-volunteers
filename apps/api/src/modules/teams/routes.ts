import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createTeamSchema, updateTeamSchema, idSchema } from '@lhcc/shared';
import { requireAdmin, requireAuth } from '../../auth/plugin.js';
import * as teamsService from './service.js';

function toTeamDto(t: {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystemTeam: boolean;
  createdAt: Date;
  memberCount: number;
  isMember?: boolean;
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    active: t.active,
    isSystemTeam: t.isSystemTeam,
    createdAt: t.createdAt.toISOString(),
    memberCount: t.memberCount,
    isMember: t.isMember,
  };
}

function toMemberDto(m: {
  teamId: string;
  userId: string;
  joinedAt: Date;
  userName: string;
  userEmail: string;
  userRole: string;
  userActive: boolean;
  userPhone: string | null;
}) {
  return {
    teamId: m.teamId,
    userId: m.userId,
    joinedAt: m.joinedAt.toISOString(),
    user: {
      id: m.userId,
      name: m.userName,
      email: m.userEmail,
      role: m.userRole as 'admin' | 'volunteer',
      active: m.userActive,
      phone: m.userPhone,
    },
  };
}

export const teamsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/teams', async (request) => {
    const session = await requireAuth(request);
    const teams = await teamsService.listTeams(session.user.id);
    return teams.map(toTeamDto);
  });

  app.post('/api/teams', { schema: { body: createTeamSchema } }, async (request, reply) => {
    await requireAdmin(request);
    const created = await teamsService.createTeam(request.body);
    reply.status(201);
    return toTeamDto({ ...created, memberCount: 0 });
  });

  app.patch(
    '/api/teams/:id',
    { schema: { params: z.object({ id: idSchema }), body: updateTeamSchema } },
    async (request) => {
      await requireAdmin(request);
      const updated = await teamsService.updateTeam(request.params.id, request.body);
      const row = (await teamsService.listTeams()).find((t) => t.id === updated.id);
      return toTeamDto(row ?? { ...updated, memberCount: 0 });
    },
  );

  app.get(
    '/api/teams/:id/members',
    { schema: { params: z.object({ id: idSchema }) } },
    async (request) => {
      await requireAuth(request);
      const members = await teamsService.listMembers(request.params.id);
      return members.map(toMemberDto);
    },
  );

  app.post(
    '/api/teams/:id/members',
    {
      schema: {
        params: z.object({ id: idSchema }),
        body: z.object({ userId: idSchema.optional() }),
      },
    },
    async (request, reply) => {
      const session = await requireAuth(request);
      const targetUserId = request.body.userId ?? session.user.id;
      if (targetUserId !== session.user.id) {
        await requireAdmin(request);
      }
      const created = await teamsService.addMember(request.params.id, targetUserId);
      reply.status(201);
      return created;
    },
  );

  app.delete(
    '/api/teams/:id/members/:userId',
    { schema: { params: z.object({ id: idSchema, userId: idSchema }) } },
    async (request, reply) => {
      const session = await requireAuth(request);
      if (request.params.userId !== session.user.id) {
        await requireAdmin(request);
      }
      await teamsService.removeMember(request.params.id, request.params.userId);
      reply.status(204);
    },
  );
};
