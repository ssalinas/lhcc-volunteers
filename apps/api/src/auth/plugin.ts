import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { auth } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: Awaited<ReturnType<typeof auth.api.getSession>>;
  }
}

function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  // Mount better-auth's own handler for all /api/auth/* routes (OAuth callbacks,
  // email/password sign-in/up, session, sign-out, etc.) — better-auth speaks the
  // Fetch API (Request/Response), so we adapt Fastify's request/reply to it.
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, `${request.protocol}://${request.headers.host}`);
      const webRequest = new Request(url, {
        method: request.method,
        headers: toWebHeaders(request),
        body:
          request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : JSON.stringify(request.body ?? {}),
      });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      const text = await response.text();
      reply.send(text.length > 0 ? text : null);
    },
  });

  // Attach the resolved session (if any) to every request so downstream route
  // handlers/preHandlers can read request.session without re-fetching it.
  fastify.decorateRequest('session', null);
  fastify.addHook('preHandler', async (request) => {
    request.session = await auth.api.getSession({ headers: toWebHeaders(request) });
  });
});

export async function requireAuth(request: FastifyRequest) {
  if (!request.session) {
    const err = new Error('Unauthorized');
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  const active = (request.session.user as { active?: boolean }).active;
  if (active === false) {
    const err = new Error('Your account is pending admin approval.');
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return request.session;
}

export async function requireAdmin(request: FastifyRequest) {
  const session = await requireAuth(request);
  const role = (session.user as { role?: string }).role;
  if (role !== 'admin') {
    const err = new Error('Forbidden: admin access required');
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return session;
}
