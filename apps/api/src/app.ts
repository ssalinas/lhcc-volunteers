import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env, isProduction } from './config/env.js';
import { authPlugin } from './auth/plugin.js';
import { usersRoutes } from './modules/users/routes.js';
import { teamsRoutes } from './modules/teams/routes.js';
import { availabilityRoutes } from './modules/availability/routes.js';
import { eventsRoutes } from './modules/events/routes.js';
import { occurrencesRoutes } from './modules/occurrences/routes.js';
import { assignmentsRoutes } from './modules/assignments/routes.js';
import { reportsRoutes } from './modules/reports/routes.js';
import { backupsRoutes } from './modules/backups/routes.js';
import { scheduleNotificationsRoutes } from './modules/scheduleNotifications/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDistPath = join(__dirname, '../../web/dist');

export async function buildApp() {
  const app = Fastify({
    logger: isProduction
      ? true
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.TRUSTED_ORIGINS,
    credentials: true,
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(error);
    }
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : error.message,
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(authPlugin);
  await app.register(usersRoutes);
  await app.register(teamsRoutes);
  await app.register(availabilityRoutes);
  await app.register(eventsRoutes);
  await app.register(occurrencesRoutes);
  await app.register(assignmentsRoutes);
  await app.register(reportsRoutes);
  await app.register(backupsRoutes);
  await app.register(scheduleNotificationsRoutes);

  if (isProduction) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.method === 'GET' && !request.url.startsWith('/api')) {
        reply.sendFile('index.html');
      } else {
        reply.status(404).send({ error: 'Not found' });
      }
    });
  }

  return app;
}
