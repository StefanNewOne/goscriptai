import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { embed, embeddingsEnabled, toVectorLiteral } from '../lib/embeddings.js';

interface SearchParams { q?: string; type?: string; status?: string; star?: boolean; clientId?: string }

// Generate + store a script's embedding for semantic search. No-op without a
// Voyage key. Fire-and-forget from the write paths — a failure here must never
// break generation/import.
export async function indexScript(scriptId: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  const script = await prisma.script.findUnique({ where: { id: scriptId }, select: { title: true, markdown: true } });
  if (!script) return;
  const text = [script.title, script.markdown].filter(Boolean).join('\n');
  const vec = await embed(text, 'document');
  if (!vec) return;
  await prisma.$executeRaw`UPDATE "Script" SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${scriptId}`;
}

// Rank the indexed scripts by cosine distance to the query. Returns null when
// embeddings are off; errors propagate to the text fallback.
async function semanticIds(q: string, params: SearchParams): Promise<string[] | null> {
  const qvec = await embed(q, 'query');
  if (!qvec) return null;
  const conds: Prisma.Sql[] = [Prisma.sql`embedding IS NOT NULL`];
  if (params.clientId) conds.push(Prisma.sql`"clientId" = ${params.clientId}`);
  if (params.type) conds.push(Prisma.sql`type = ${params.type}`);
  if (params.status) conds.push(Prisma.sql`status = ${params.status}`);
  if (params.star) conds.push(Prisma.sql`"isStarExample" = true`);
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "Script" WHERE ${Prisma.join(conds, ' AND ')} ORDER BY embedding <=> ${toVectorLiteral(qvec)}::vector LIMIT 100`,
  );
  return rows.map((r) => r.id);
}

// Script database (Design Brief §7.11). Semantic search over the pgvector
// `embedding` column when Voyage is configured AND scripts are indexed; text
// search over code/title otherwise (and as the fallback on any embedding error).
export async function searchScripts(params: SearchParams) {
  const q = params.q?.trim();
  if (q && embeddingsEnabled()) {
    try {
      const ids = await semanticIds(q, params);
      if (ids && ids.length > 0) {
        const scripts = await prisma.script.findMany({ where: { id: { in: ids } }, include: { client: { select: { name: true, code: true } } } });
        const order = new Map(ids.map((id, i) => [id, i]));
        return scripts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
      // ids null (no key) or empty (nothing indexed yet) → text fallback below.
    } catch {
      // Embedding/query failure → fall through to text search.
    }
  }
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

// Backfill embeddings for any script missing one (Admin-triggered). No-op
// without a Voyage key.
export async function backfillEmbeddings(): Promise<{ indexed: number; total: number }> {
  if (!embeddingsEnabled()) return { indexed: 0, total: 0 };
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Script" WHERE embedding IS NULL`;
  let indexed = 0;
  for (const r of rows) {
    try {
      await indexScript(r.id);
      indexed++;
    } catch {
      // skip a script that fails to embed; the rest still index
    }
  }
  return { indexed, total: rows.length };
}

export async function getScript(id: string) {
  const script = await prisma.script.findUnique({ where: { id }, include: { client: { select: { name: true, code: true } }, versions: { orderBy: { version: 'desc' } } } });
  if (!script) throw new AppError('NOT_FOUND', 'Сценариото не постои.');
  return script;
}

export async function toggleStar(id: string, isStar: boolean) {
  return prisma.script.update({ where: { id }, data: { isStarExample: isStar } });
}
