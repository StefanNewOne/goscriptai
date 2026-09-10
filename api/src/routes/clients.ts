import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createClientSchema, updateClientSchema } from '../schemas/client.js';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  advanceClient,
  suggestCodeForName,
} from '../services/clientService.js';

export async function clientRoutes(app: FastifyInstance) {
  // All client routes require an authenticated user.
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => ({ data: await listClients() }));

  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return { data: await getClient(id) };
  });

  app.get('/suggest-code', async (req) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.query);
    return { data: { code: suggestCodeForName(name) } };
  });

  // Writers and admins may create/update; viewers may not.
  app.post('/', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req, reply) => {
    const input = createClientSchema.parse(req.body);
    const client = await createClient(input);
    return reply.status(201).send({ data: client });
  });

  app.patch('/:id', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = updateClientSchema.parse(req.body);
    return { data: await updateClient(id, input) };
  });

  app.post('/:id/advance', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { to, data } = z.object({ to: z.string(), data: z.record(z.string(), z.unknown()).optional() }).parse(req.body);
    return { data: await advanceClient(id, to, req.authUser.role, data) };
  });
}
