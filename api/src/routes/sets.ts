import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import * as setService from '../services/setService.js';
import { exportSet } from '../services/exportService.js';
import { findSimilar, enrichFromSource } from '../services/reconcileService.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

const idParam = z.object({ id: z.string() });

const frameSchema = z.object({
  role: z.enum(['ХООК', 'БОДИ', 'ЦТА']),
  direction: z.string(),
  lines: z.array(z.object({ actor: z.string(), text: z.string() })),
  editing: z.string().optional(),
  subLabel: z.string().optional(),
  table: z.array(z.object({ index: z.number(), product: z.string(), oldPrice: z.string().optional(), newPrice: z.string().optional() })).optional(),
});
const contentSchema = z.object({ frames: z.array(frameSchema) });

export async function setRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const write = { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] };

  app.get('/sets', async (req) => {
    const q = z.object({ clientId: z.string().optional(), mine: z.string().optional() }).parse(req.query);
    return { data: await setService.listSets({ clientId: q.clientId, writerUserId: q.mine === '1' ? req.authUser.id : undefined }) };
  });

  app.get('/sets/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await setService.getSet(id) };
  });

  app.post('/sets', write, async (req, reply) => {
    const body = z
      .object({
        clientId: z.string(),
        requested: z.number().int().min(1).max(10),
        brief: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    const set = await setService.createSet({ clientId: body.clientId, writerUserId: req.authUser.id, requested: body.requested, brief: body.brief });
    return reply.status(201).send({ data: set });
  });

  app.post('/concepts/:id/decision', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { decision, comment } = z.object({ decision: z.enum(['SELECTED', 'REJECTED']), comment: z.string().optional() }).parse(req.body);
    return { data: await setService.decideConcept(id, decision, comment) };
  });

  app.post('/sets/:id/write', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await setService.writeSelected(id, req.authUser.id) };
  });

  app.post('/sets/:id/retry', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await setService.retrySet(id) };
  });

  app.post('/scripts/:id/approve', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await setService.approveScript(id, req.authUser.id) };
  });

  app.post('/scripts/:id/return', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { comment } = z.object({ comment: z.string().min(1) }).parse(req.body);
    return { data: await setService.returnScript(id, req.authUser.id, comment) };
  });

  app.patch('/scripts/:id/content', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { content } = z.object({ content: contentSchema }).parse(req.body);
    return { data: await setService.editScript(id, content, req.authUser.id) };
  });

  // Reconcile: scripts most similar to this one (find an old doc's video twin).
  app.get('/scripts/:id/similar', async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await findSimilar(id) };
  });

  // Carry the rich fields this script lacks over from a similar source script.
  app.post('/scripts/:id/enrich', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { sourceId } = z.object({ sourceId: z.string() }).parse(req.body);
    return { data: await enrichFromSource(id, sourceId) };
  });

  app.post('/sets/:id/export', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await exportSet(id) };
  });

  app.get('/sets/:id/export/download', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { type } = z.object({ type: z.enum(['docx', 'md']) }).parse(req.query);
    const set = await prisma.scriptSet.findUnique({ where: { id } });
    const path = type === 'docx' ? set?.exportPath : set?.exportMdPath;
    if (!path) throw new AppError('NOT_FOUND', 'Документот не е генериран.');
    reply.header('Content-Disposition', `attachment; filename="${path.split(/[\\/]/).pop()}"`);
    reply.type(type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/markdown');
    return reply.send(createReadStream(path));
  });
}
