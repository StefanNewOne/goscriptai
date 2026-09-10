import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as onb from '../services/onboardingService.js';

const idParam = z.object({ id: z.string() });

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const write = { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] };

  app.post('/clients/:id/analyze', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await onb.startAnalysis(id, req.authUser.role) };
  });

  app.get('/clients/:id/questions', async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await onb.getQuestions(id) };
  });

  app.post('/clients/:id/answers', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { answers } = z.object({ answers: z.record(z.string(), z.string()) }).parse(req.body);
    return { data: await onb.submitAnswers(id, req.authUser.role, answers) };
  });

  app.post('/clients/:id/profile-decision', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { decision, comment } = z.object({ decision: z.enum(['approve', 'request_changes']), comment: z.string().optional() }).parse(req.body);
    return { data: await onb.decideProfile(id, req.authUser.role, req.authUser.id, decision, comment) };
  });

  app.post('/clients/:id/avatars-decision', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const { decision, comment } = z.object({ decision: z.enum(['approve', 'request_changes']), comment: z.string().optional() }).parse(req.body);
    return { data: await onb.decideAvatars(id, req.authUser.role, req.authUser.id, decision, comment) };
  });

  app.post('/clients/:id/activate', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await onb.activate(id, req.authUser.role) };
  });
}
