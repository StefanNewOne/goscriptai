import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

interface IntakeConfig {
  webUrl?: string;
  videosPath?: string;
  graphicsPath?: string;
  docsPath?: string;
}

// Create a UI-triggered intake job. The heavy work runs on a LOCAL companion
// worker (scrape/Gemini/docs); this only records what to do + where the files
// are, never the files themselves.
export async function createIntakeJob(clientId: string, cfg: IntakeConfig) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  if (!cfg.webUrl && !cfg.videosPath && !cfg.graphicsPath && !cfg.docsPath) {
    throw new AppError('VALIDATION_FAILED', 'Дај барем еден извор (веб URL или папка).');
  }
  return prisma.intakeJob.create({
    data: {
      clientId,
      webUrl: cfg.webUrl || null,
      videosPath: cfg.videosPath || null,
      graphicsPath: cfg.graphicsPath || null,
      docsPath: cfg.docsPath || null,
      status: 'PENDING',
    },
  });
}

export async function listClientIntakeJobs(clientId: string) {
  return prisma.intakeJob.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 10 });
}

// The local worker claims the oldest PENDING job atomically — the guarded
// updateMany prevents two workers grabbing the same job.
export async function claimNextIntakeJob() {
  const next = await prisma.intakeJob.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  if (!next) return null;
  const claimed = await prisma.intakeJob.updateMany({
    where: { id: next.id, status: 'PENDING' },
    data: { status: 'RUNNING', progress: 'Започнато' },
  });
  if (claimed.count === 0) return null; // another worker grabbed it first
  return prisma.intakeJob.findUnique({ where: { id: next.id }, include: { client: { select: { code: true, name: true } } } });
}

export async function updateIntakeJob(id: string, data: { status?: string; progress?: string; error?: string }) {
  return prisma.intakeJob.update({ where: { id }, data });
}
