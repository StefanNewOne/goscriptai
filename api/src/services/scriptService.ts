import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

// Script database (Design Brief §7.11). Text search over code/title now;
// semantic search over the pgvector `embedding` column shares the same input
// once embeddings are generated (Ф2) — the query param is the same field.
export async function searchScripts(params: { q?: string; type?: string; status?: string; star?: boolean; clientId?: string }) {
  const q = params.q?.trim();
  return prisma.script.findMany({
    where: {
      clientId: params.clientId,
      type: params.type as never,
      status: params.status as never,
      isStarExample: params.star ? true : undefined,
      ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { client: { select: { name: true, code: true } } },
  });
}

export async function getScript(id: string) {
  const script = await prisma.script.findUnique({ where: { id }, include: { client: { select: { name: true, code: true } }, versions: { orderBy: { version: 'desc' } } } });
  if (!script) throw new AppError('NOT_FOUND', 'Сценариото не постои.');
  return script;
}

export async function toggleStar(id: string, isStar: boolean) {
  return prisma.script.update({ where: { id }, data: { isStarExample: isStar } });
}
