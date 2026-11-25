import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { setAvailabilityStatusSchema } from '@lhcc/shared';
import { resolveResponseToken } from '../../lib/responseTokens.js';
import { NotFoundError } from '../../lib/http-errors.js';
import { getRelevantAvailabilityDates } from '../scheduling/availabilityGaps.js';
import * as availabilityService from '../availability/service.js';

/** Matches AvailabilityDateList's HORIZON_DAYS, so the email-link page shows as far ahead as the app does. */
const RESPOND_HORIZON_DAYS = 120;

const tokenParam = z.object({ token: z.string().min(20).max(200) });
const tokenDateParam = tokenParam.extend({ date: z.string().date() });

const EXPIRED = 'This link has expired or is no longer valid.';

async function userForToken(token: string) {
  const found = await resolveResponseToken(token);
  if (!found) throw new NotFoundError(EXPIRED);
  return found;
}

/**
 * PUBLIC (no session) endpoints behind the buttons in availability emails — see
 * lib/responseTokens.ts. The token is the only credential, and it can only read/write the
 * availability of the one user it was minted for.
 */
export const respondRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/api/respond/:token', { schema: { params: tokenParam } }, async (request) => {
    const u = await userForToken(request.params.token);
    const now = new Date();
    const dates = await getRelevantAvailabilityDates(u.id, now, addDays(now, RESPOND_HORIZON_DAYS));
    return { firstName: u.name.split(' ')[0] || u.name, email: u.email, dates };
  });

  app.put(
    '/api/respond/:token/dates/:date',
    { schema: { params: tokenDateParam, body: setAvailabilityStatusSchema } },
    async (request) => {
      const u = await userForToken(request.params.token);
      await availabilityService.setAvailabilityForDate(u.id, request.params.date, request.body.status);
      return { ok: true };
    },
  );

  app.delete('/api/respond/:token/dates/:date', { schema: { params: tokenDateParam } }, async (request, reply) => {
    const u = await userForToken(request.params.token);
    await availabilityService.clearAvailabilityForDate(u.id, request.params.date);
    reply.status(204);
  });
};
