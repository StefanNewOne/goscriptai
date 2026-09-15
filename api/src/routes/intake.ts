import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as intake from '../services/intakeService.js';

const jobConfig = z.object({
  clientId: z.string(),
  webUrl: z.string().optional(),
  videosPath: z.string().optional(),
  graphicsPath: z.string().optional(),
  docsPath: z.string().optional(),
});

// UI-triggered, locally-executed intake jobs. Create/list are for the UI; next/
// update are for the local companion worker (authenticated like any writer).
export async function intakeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const write = { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] };

  app.post('/intake/jobs', write, async (req, reply) => {
    const { clientId, ...cfg } = jobConfig.parse(req.body);
    return reply.status(201).send({ data: await intake.createIntakeJob(clientId, cfg) });
  });

  app.get('/intake/jobs', async (req) => {
    const { clientId } = z.object({ clientId: z.string() }).parse(req.query);
    return { data: await intake.listClientIntakeJobs(clientId) };
  });

  // Worker: claim the next pending job (atomic).
  app.get('/intake/jobs/next', write, async () => {
    return { data: await intake.claimNextIntakeJob() };
  });

  // Worker: report progress / final status.
  app.patch('/intake/jobs/:id', write, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ status: z.string().optional(), progress: z.string().optional(), error: z.string().optional() }).parse(req.body);
    return { data: await intake.updateIntakeJob(id, body) };
  });
}
