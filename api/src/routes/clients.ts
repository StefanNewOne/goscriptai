import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createClientSchema, updateClientSchema } from '../schemas/client.js';
import {
  listClients,
  getClient,
  listClientSets,
  createClient,
  updateClient,
  advanceClient,
  suggestCodeForName,
} from '../services/clientService.js';
import {
  ingestExtraction,
  listPendingMedia,
  confirmMedia,
  rejectMedia,
  ingestProducts,
} from '../services/ingestService.js';

const ingestSchema = z.object({
  filename: z.string().min(1),
  extraction: z.record(z.string(), z.unknown()),
});

const productsIngestSchema = z.object({
  products: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().optional(),
      price: z.number().optional(),
      essence: z.string().optional(),
    }),
  ),
});

export async function clientRoutes(app: FastifyInstance) {
  // All client routes require an authenticated user.
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => ({ data: await listClients() }));

  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return { data: await getClient(id) };
  });

  app.get('/:id/sets', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return { data: await listClientSets(id) };
  });

  // Ingestion: local tool POSTs a Gemini extraction → PENDING brain proposals.
  app.post('/:id/ingest', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = ingestSchema.parse(req.body);
    return reply.status(201).send({ data: await ingestExtraction(id, body.filename, body.extraction) });
  });

  app.get('/:id/ingest', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return { data: await listPendingMedia(id) };
  });

  const mediaParam = z.object({ id: z.string(), mediaId: z.string() });
  app.post('/:id/ingest/:mediaId/confirm', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req) => {
    const { mediaId } = mediaParam.parse(req.params);
    return { data: await confirmMedia(mediaId) };
  });
  app.post('/:id/ingest/:mediaId/reject', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req) => {
    const { mediaId } = mediaParam.parse(req.params);
    return { data: await rejectMedia(mediaId) };
  });

  // Web scrape → product proposals (confirmed=false).
  app.post('/:id/products/ingest', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = productsIngestSchema.parse(req.body);
    return reply.status(201).send({ data: await ingestProducts(id, body.products) });
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
