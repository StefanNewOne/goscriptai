import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

// Receives a Gemini video→script extraction and stores it as PENDING brain
// proposals — a MediaAsset (the full extraction), Mentions (what was said about
// products), and Tag vocabulary. Nothing becomes active until a scriptwriter
// confirms (invariant 2). The IMPORTED Script is created at confirm time, not
// here. Local ingestion tool POSTs to /clients/:id/ingest.

interface Extraction {
  brain?: {
    tags?: { videoType?: string; topic?: string[]; hookType?: string; ctaGoal?: string; extra?: string[] };
    productMentions?: { name?: string; essence?: string; quote?: string }[];
  };
}

export async function ingestExtraction(clientId: string, filename: string, extraction: Extraction) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');

  const asset = await prisma.mediaAsset.create({
    data: { clientId, kind: 'VIDEO', filename, extraction: extraction as never, status: 'PENDING' },
  });

  const mentions = (extraction.brain?.productMentions ?? []).filter((m) => m?.name);
  for (const m of mentions) {
    await prisma.mention.create({
      data: {
        clientId,
        mediaId: asset.id,
        name: m.name!,
        essence: m.essence ?? '',
        quote: m.quote ?? null,
        status: 'PENDING',
      },
    });
  }

  const t = extraction.brain?.tags;
  const tagPairs: { dimension: string; value: string }[] = [];
  if (t) {
    if (t.videoType) tagPairs.push({ dimension: 'videoType', value: t.videoType });
    for (const v of t.topic ?? []) tagPairs.push({ dimension: 'topic', value: v });
    if (t.hookType) tagPairs.push({ dimension: 'hookType', value: t.hookType });
    if (t.ctaGoal) tagPairs.push({ dimension: 'ctaGoal', value: t.ctaGoal });
    for (const v of t.extra ?? []) tagPairs.push({ dimension: 'extra', value: v });
  }
  for (const p of tagPairs) {
    if (!p.value) continue;
    await prisma.tag.upsert({
      where: { clientId_dimension_value: { clientId, dimension: p.dimension, value: p.value } },
      update: {},
      create: { clientId, dimension: p.dimension, value: p.value },
    });
  }

  return { mediaAssetId: asset.id, mentions: mentions.length, tags: tagPairs.length };
}

export async function listPendingMedia(clientId: string) {
  return prisma.mediaAsset.findMany({
    where: { clientId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: { mentions: true },
  });
}
