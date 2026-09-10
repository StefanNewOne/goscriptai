import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { pathToFileURL } from 'node:url';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './env.js';
import { AppError } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/clients.js';
import { brainRoutes } from './routes/brain.js';
import { importRoutes } from './routes/import.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { streamRoutes } from './routes/stream.js';
import { setRoutes } from './routes/sets.js';
import { opsRoutes } from './routes/ops.js';
import { catalogRoutes } from './routes/catalog.js';
import { registerWorkers } from './queues/index.js';

// Fastify bootstrap. Routes are thin (validate → service → respond); all
// responses are { data } or { error: { code, message, details? } }.
export async function buildServer() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
    bodyLimit: 20 * 1024 * 1024, // 20 MB for intake uploads
  });

  await app.register(cors, { origin: env.APP_URL, credentials: true });
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.JWT_EXPIRES_IN } });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(authPlugin);

  // Treat an empty JSON body as {} so no-body POSTs (analyze, activate, confirm)
  // don't trip FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'Невалидни податоци.', details: error.issues },
      });
    }
    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'Невалидни податоци.', details: error.validation },
      });
    }
    // Honor Fastify client errors (4xx) instead of masking them as 500.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: error.code ?? 'VALIDATION_FAILED', message: error.message },
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'AGENT_FAILED', message: 'Настана внатрешна грешка.' } });
  });

  app.get('/health', async () => ({ data: { ok: true } }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(clientRoutes, { prefix: '/api/v1/clients' });
  await app.register(brainRoutes, { prefix: '/api/v1' });
  await app.register(importRoutes, { prefix: '/api/v1/import' });
  await app.register(onboardingRoutes, { prefix: '/api/v1' });
  await app.register(streamRoutes, { prefix: '/api/v1' });
  await app.register(setRoutes, { prefix: '/api/v1' });
  await app.register(opsRoutes, { prefix: '/api/v1' });
  await app.register(catalogRoutes, { prefix: '/api/v1' });

  // Agent job workers run in-process (dev). Every agent phase is a BullMQ job.
  registerWorkers();

  // Boot reaper: any AgentRun left RUNNING (process died mid-run) is failed so
  // it doesn't linger forever (invariant 10). Sets are recovered via retry.
  await prisma.agentRun.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Прекинато при рестарт.' } });

  return app;
}

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  buildServer()
    .then((app) => app.listen({ port: env.API_PORT, host: '0.0.0.0' }))
    .then((addr) => {
      // eslint-disable-next-line no-console
      console.log(`GoScriptAI API listening on ${addr}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
