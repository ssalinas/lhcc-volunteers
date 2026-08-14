import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idSchema } from '@lhcc/shared';
import { requireAdmin } from '../../auth/plugin.js';
import * as reportsService from './service.js';

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/reports/volunteer-history',
    {
      schema: {
        querystring: z.object({
          userId: idSchema.optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
      },
    },
    async (request) => {
      await requireAdmin(request);
      const { userId, from, to } = request.query;
      const rows = await reportsService.getVolunteerHistory({
        userId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      return rows.map((r) => ({ ...r, lastServedAt: r.lastServedAt ? r.lastServedAt.toISOString() : null }));
    },
  );

  app.get(
    '/api/reports/team-summary',
    {
      schema: {
        querystring: z.object({
          teamId: idSchema.optional(),
          weeks: z.coerce.number().int().positive().default(8),
        }),
      },
    },
    async (request) => {
      await requireAdmin(request);
      return reportsService.getTeamSummary(request.query.weeks, request.query.teamId);
    },
  );

  app.get(
    '/api/reports/coverage',
    {
      schema: {
        querystring: z.object({
          from: z.string().datetime(),
          to: z.string().datetime(),
        }),
      },
    },
    async (request) => {
      await requireAdmin(request);
      return reportsService.getCoverageGaps(new Date(request.query.from), new Date(request.query.to));
    },
  );
};
