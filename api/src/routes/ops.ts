import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getInbox } from '../services/inboxService.js';
import { listNotifications } from '../services/notificationService.js';
import { raiseSetBudget } from '../services/setService.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

// Inbox, notifications, budget raise, and Settings (Admin).
export async function opsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/inbox', async (req) => {
    const { mine } = z.object({ mine: z.string().optional() }).parse(req.query);
    return { data: await getInbox(mine === '1' ? req.authUser.id : undefined) };
  });

  app.get('/notifications', async (req) => {
    return { data: await listNotifications(req.authUser.id) };
  });

  app.post('/sets/:id/raise-budget', { preHandler: [app.requireRole('ADMIN')] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { budgetUsd } = z.object({ budgetUsd: z.number().positive() }).parse(req.body);
    return { data: await raiseSetBudget(id, budgetUsd) };
  });

  // ── Settings (Admin) ──────────────────────────────────────────────
  app.get('/settings/templates', { preHandler: [app.requireRole('ADMIN')] }, async () => {
    return { data: await prisma.template.findMany({ where: { active: true }, orderBy: [{ kind: 'asc' }, { version: 'desc' }] }) };
  });

  // Full version history for a kind (newest first) — for the diff view.
  app.get('/settings/templates/:kind/versions', { preHandler: [app.requireRole('ADMIN')] }, async (req) => {
    const { kind } = z.object({ kind: z.string() }).parse(req.params);
    return { data: await prisma.template.findMany({ where: { kind, language: null }, orderBy: { version: 'desc' } }) };
  });

  app.post('/settings/templates/:kind', { preHandler: [app.requireRole('ADMIN')] }, async (req) => {
    const { kind } = z.object({ kind: z.string() }).parse(req.params);
    const { content } = z.object({ content: z.string().min(1) }).parse(req.body);
    // Save as a new version and activate it (previous versions stay for running work).
    const latest = await prisma.template.findFirst({ where: { kind }, orderBy: { version: 'desc' } });
    if (!latest) throw new AppError('NOT_FOUND', 'Темплејтот не постои.');
    await prisma.template.updateMany({ where: { kind, active: true }, data: { active: false } });
    const created = await prisma.template.create({ data: { kind, version: latest.version + 1, content, active: true } });
    return { data: created };
  });

  // Only non-secret configuration keys are readable/writable here. Secrets live
  // in env, never in the Setting table (defense against a key oracle).
  const settingKey = z.enum(['model_routing', 'critic_rubric', 'banned_phrases']);

  app.get('/settings/:key', { preHandler: [app.requireRole('ADMIN')] }, async (req) => {
    const { key } = z.object({ key: settingKey }).parse(req.params);
    const setting = await prisma.setting.findUnique({ where: { key } });
    return { data: setting?.value ?? null };
  });

  app.put('/settings/:key', { preHandler: [app.requireRole('ADMIN')] }, async (req) => {
    const { key } = z.object({ key: settingKey }).parse(req.params);
    const { value } = z.object({ value: z.unknown() }).parse(req.body);
    const setting = await prisma.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
    return { data: setting.value };
  });
}
