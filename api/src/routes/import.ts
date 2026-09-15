import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as importService from '../services/importService.js';
import { docxToText } from '../lib/docxText.js';
import { findSimilar } from '../services/reconcileService.js';
import { AppError } from '../lib/errors.js';
import type { ScriptType } from '../domain/types.js';

const SCRIPT_TYPES = ['PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH'] as const;

// Turn parsed rich text into a committed IMPORTED star-example script. Shared by
// the docx-upload and paste-text paths so old scripts land as the client's base
// WITH their hook/caption variants and production note.
async function commitRich(clientId: string, text: string, opts: { title?: string; type?: string; isStarExample?: boolean }) {
  const rich = importService.parseRich(text);
  const type = (SCRIPT_TYPES as readonly string[]).includes(opts.type ?? '') ? (opts.type as ScriptType) : 'EDUCATIONAL';
  const script = await importService.commit({
    clientId,
    title: opts.title || rich.title || 'Увезено сценарио',
    type,
    content: rich.content,
    isStarExample: opts.isStarExample ?? true,
    actorIds: [],
    format: rich.format,
    vibe: rich.vibe,
    music: rich.music,
    platforms: rich.platforms,
    durationSec: rich.durationSec,
    hookVariants: rich.hookVariants,
    captions: rich.captions,
    productionNote: rich.productionNote,
  });
  // Surface the video-derived twin (if any) so the writer sees the match right away.
  const similar = await findSimilar(script.id);
  return {
    scriptId: script.id,
    code: script.code,
    title: script.title,
    hooks: rich.hookVariants.length,
    captions: rich.captions.length,
    frames: rich.content.frames.length,
    warnings: rich.warnings,
    similar: similar.slice(0, 3),
  };
}

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

  // Preview the rich parse of a delivered scenario (paste text) — no write.
  app.post('/rich-parse', write, async (req) => {
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    return { data: importService.parseRich(text) };
  });

  // Import old delivered scenario as text (paste or local-tool extracted).
  app.post('/document-text', write, async (req, reply) => {
    const body = z
      .object({ clientId: z.string(), text: z.string().min(1), title: z.string().optional(), type: z.string().optional(), isStarExample: z.boolean().optional() })
      .parse(req.body);
    return reply.status(201).send({ data: await commitRich(body.clientId, body.text, body) });
  });

  // Import old delivered scenario as an uploaded .docx (multipart: file + fields).
  app.post('/document', write, async (req, reply) => {
    let clientId = '';
    let title: string | undefined;
    let type: string | undefined;
    let isStar = true;
    let buffer: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') buffer = await part.toBuffer();
      else if (part.fieldname === 'clientId') clientId = String(part.value);
      else if (part.fieldname === 'title') title = String(part.value);
      else if (part.fieldname === 'type') type = String(part.value);
      else if (part.fieldname === 'isStarExample') isStar = String(part.value) !== 'false';
    }
    if (!clientId || !buffer) throw new AppError('VALIDATION_FAILED', 'Треба clientId и .docx фајл.');
    const text = await docxToText(buffer);
    return reply.status(201).send({ data: await commitRich(clientId, text, { title, type, isStarExample: isStar }) });
  });
}
