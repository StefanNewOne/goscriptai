import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchScripts, getScript, toggleStar, backfillEmbeddings } from '../services/scriptService.js';
import { monthlyReport, clientReport } from '../services/reportService.js';

// Script database + reports (read-mostly dashboard screens).
export async function catalogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/scripts', async (req) => {
    const q = z
      .object({
        q: z.string().optional(),
        type: z.enum(['PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH']).optional(),
        status: z.enum(['DRAFT', 'WRITING', 'CRITIC_RUNNING', 'CRITIC_FAILED', 'SCRIPTS_REVIEW', 'APPROVED', 'EXPORTED', 'LIVE', 'LEARNED']).optional(),
        star: z.enum(['0', '1']).optional(),
        clientId: z.string().optional(),
      })
      .parse(req.query);
    return { data: await searchScripts({ ...q, star: q.star === '1' }) };
  });

  app.get('/scripts/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return { data: await getScript(id) };
  });

  app.post('/scripts/:id/star', { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { star } = z.object({ star: z.boolean() }).parse(req.body);
    return { data: await toggleStar(id, star) };
  });

  // Backfill semantic embeddings for scripts missing one (no-op without Voyage).
  app.post('/scripts/reindex', { preHandler: [app.requireRole('ADMIN')] }, async () => {
    return { data: await backfillEmbeddings() };
  });

  app.get('/reports/monthly', async () => ({ data: await monthlyReport() }));
  app.get('/reports/clients', async () => ({ data: await clientReport() }));
}
