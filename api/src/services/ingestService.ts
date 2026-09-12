import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { commit } from './importService.js';
import { isFrameRole, type Frame, type ScriptContent } from '../domain/scriptFormat.js';
import type { ScriptType } from '../domain/types.js';

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

function mapType(videoType?: string): ScriptType {
  const v = (videoType ?? '').toLowerCase();
  if (v.includes('продаж')) return 'PRODUCT_OFFER';
  if (v.includes('тестимон')) return 'TESTIMONIAL';
  if (v.includes('скеч')) return 'SKETCH';
  return 'EDUCATIONAL';
}

interface ShotIn {
  role?: string;
  description?: string;
  onScreenText?: string;
  actor?: string;
  line?: string;
}

function mapShot(sh: ShotIn): Frame {
  return {
    role: isFrameRole(sh?.role ?? '') ? (sh.role as Frame['role']) : 'БОДИ',
    direction: sh?.description ?? '',
    lines: sh?.line ? [{ actor: sh.actor || 'Актер', text: sh.line }] : [],
    ...(sh?.onScreenText ? { subLabel: `Текст на екран: ${sh.onScreenText}` } : {}),
  };
}

// Confirm a PENDING media asset: create the IMPORTED Script from its extraction
// (a format-profile example), mark its mentions CONFIRMED, and log the change.
export async function confirmMedia(mediaId: string) {
  const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!media) throw new AppError('NOT_FOUND', 'Медиумот не постои.');
  if (media.status !== 'PENDING') throw new AppError('WRONG_STATUS', 'Веќе обработено.');

  const ex = media.extraction as {
    script?: { title?: string; shots?: ShotIn[] };
    brain?: { tags?: { videoType?: string } };
  };
  const s = ex.script ?? {};
  const content: ScriptContent = { frames: (s.shots ?? []).map(mapShot) };

  const script = await commit({
    clientId: media.clientId,
    title: s.title || media.filename,
    type: mapType(ex.brain?.tags?.videoType),
    content,
    isStarExample: true,
  });

  await prisma.mediaAsset.update({ where: { id: mediaId }, data: { status: 'CONFIRMED', scriptId: script.id } });
  await prisma.mention.updateMany({ where: { mediaId }, data: { status: 'CONFIRMED' } });
  await prisma.brainChange.create({
    data: { clientId: media.clientId, kind: 'Сценарио', summary: `Потврдено увезено сценарио ${script.code}.` },
  });
  return { scriptId: script.id, code: script.code };
}

export async function rejectMedia(mediaId: string) {
  const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!media) throw new AppError('NOT_FOUND', 'Медиумот не постои.');
  await prisma.mediaAsset.update({ where: { id: mediaId }, data: { status: 'REJECTED' } });
  await prisma.mention.updateMany({ where: { mediaId }, data: { status: 'REJECTED' } });
  return { ok: true };
}

// Web scrape → product catalog PROPOSALS (confirmed=false). Essence-focused;
// the scriptwriter confirms in the Products tab. Price is a hint, not truth.
export async function ingestProducts(
  clientId: string,
  products: { name?: string; category?: string; price?: number; essence?: string }[],
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  let created = 0;
  for (const p of products) {
    if (!p?.name) continue;
    await prisma.product.create({
      data: {
        clientId,
        name: p.name,
        category: p.category ?? null,
        price: p.price != null ? p.price : null,
        usp: p.essence ?? null,
        confirmed: false,
        active: true,
      },
    });
    created++;
  }
  if (created > 0) {
    await prisma.brainChange.create({
      data: { clientId, kind: 'Продукт', summary: `Предложени ${created} продукти од веб (чекаат потврда).` },
    });
  }
  return { created };
}
