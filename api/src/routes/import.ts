import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as importService from '../services/importService.js';

const frameSchema = z.object({
  role: z.enum(['ХООК', 'БОДИ', 'ЦТА']),
  direction: z.string(),
  lines: z.array(z.object({ actor: z.string(), text: z.string() })),
  editing: z.string().optional(),
  subLabel: z.string().optional(),
  table: z
    .array(z.object({ index: z.number(), product: z.string(), oldPrice: z.string().optional(), newPrice: z.string().optional() }))
    .optional(),
});

const commitSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1),
  type: z.enum(['PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH']),
  code: z.string().optional(),
  adDate: z.coerce.date().optional(),
  avatarId: z.string().optional(),
  actorIds: z.array(z.string()).optional(),
  locationId: z.string().optional(),
  isStarExample: z.boolean().optional(),
  content: z.object({ frames: z.array(frameSchema) }),
});

export async function importRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const write = { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] };

  app.post('/parse', write, async (req) => {
    const { text } = z.object({ text: z.string() }).parse(req.body);
    return { data: importService.parse(text) };
  });

  app.post('/commit', write, async (req, reply) => {
    const input = commitSchema.parse(req.body);
    const script = await importService.commit(input);
    return reply.status(201).send({ data: script });
  });
}
