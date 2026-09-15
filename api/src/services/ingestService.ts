import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { commit } from './importService.js';
import { type Frame, type ScriptContent } from '../domain/scriptFormat.js';
import type { ScriptType } from '../domain/types.js';

// Normalize shot roles — some models return Latin (HOOK/BODY/CTA).
const ROLE_MAP: Record<string, Frame['role']> = {
  ХООК: 'ХООК',
  БОДИ: 'БОДИ',
  ЦТА: 'ЦТА',
  HOOK: 'ХООК',
  BODY: 'БОДИ',
  CTA: 'ЦТА',
};

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

  // Idempotent push: skip a video that's already in the brain (same filename),
  // so re-pushing a folder never duplicates media/scripts.
  const dup = await prisma.mediaAsset.findFirst({ where: { clientId, filename } });
  if (dup) return { mediaAssetId: dup.id, mentions: 0, tags: 0, duplicate: true, status: dup.status };

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
    role: ROLE_MAP[(sh?.role ?? '').toUpperCase().trim()] ?? 'БОДИ',
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
    brain?: { tags?: { videoType?: string }; location?: { name?: string; description?: string } };
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

  // Propose the filming location (invariant 2) if the extraction captured one and
  // it isn't already in the brain — deduped by name, awaiting confirmation.
  const loc = ex.brain?.location;
  const locName = (loc?.name ?? '').trim();
  if (locName) {
    const exists = await prisma.location.findFirst({ where: { clientId: media.clientId, name: { equals: locName, mode: 'insensitive' } } });
    if (!exists) {
      await prisma.location.create({
        data: { clientId: media.clientId, name: locName, description: (loc?.description ?? '').trim(), confirmed: false },
      });
      await prisma.brainChange.create({
        data: { clientId: media.clientId, kind: 'Локација', summary: `Предложена локација „${locName}“ од видео (чека потврда).` },
      });
    }
  }
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
  // Dedup across sources (web/graphics/manual) by name so the same product isn't
  // proposed twice — protects catalog quality when brains merge multiple sources.
  const seen = new Set(
    (await prisma.product.findMany({ where: { clientId }, select: { name: true } })).map((x) => x.name.trim().toLowerCase()),
  );
  let created = 0;
  for (const p of products) {
    const name = (p?.name ?? '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    await prisma.product.create({
      data: {
        clientId,
        name,
        category: p.category ?? null,
        price: p.price != null ? p.price : null,
        usp: p.essence ?? null,
        confirmed: false,
        active: true,
      },
    });
    seen.add(name.toLowerCase());
    created++;
  }
  if (created > 0) {
    await prisma.brainChange.create({
      data: { clientId, kind: 'Продукт', summary: `Предложени ${created} продукти од веб (чекаат потврда).` },
    });
  }
  return { created };
}

// Graphics → Brain. A Gemini image reading yields catalog PROPOSALS (products/
// offers) and brand-voice PROPOSALS (slogans/taglines). Everything lands as
// PENDING (confirmed=false) — the scriptwriter confirms (invariant 2). Slogans
// become PREFERRED glossary terms so the Writer can echo the client's own voice.
// Catalog↔mentions stays intact: what a graphic SAYS is a proposal, not truth;
// essence matters more than the printed price. POST /clients/:id/graphics.
export async function ingestGraphics(
  clientId: string,
  data: {
    products?: { name?: string; category?: string; price?: number; essence?: string }[];
    slogans?: string[];
    brandNotes?: string;
  },
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');

  const seenProducts = new Set(
    (await prisma.product.findMany({ where: { clientId }, select: { name: true } })).map((x) => x.name.trim().toLowerCase()),
  );
  let productsCreated = 0;
  for (const p of data.products ?? []) {
    const name = (p?.name ?? '').trim();
    if (!name || seenProducts.has(name.toLowerCase())) continue;
    await prisma.product.create({
      data: {
        clientId,
        name,
        category: p.category ?? null,
        price: p.price != null ? p.price : null,
        usp: p.essence ?? null,
        confirmed: false,
        active: true,
      },
    });
    seenProducts.add(name.toLowerCase());
    productsCreated++;
  }

  const existingTerms = new Set(
    (await prisma.glossaryTerm.findMany({ where: { clientId }, select: { term: true } })).map((g) => g.term.toLowerCase()),
  );
  let slogansCreated = 0;
  for (const raw of data.slogans ?? []) {
    const term = (raw ?? '').trim();
    if (!term || existingTerms.has(term.toLowerCase())) continue;
    await prisma.glossaryTerm.create({
      data: { clientId, language: client.language, term, meaning: 'Слоган/порака од графика', kind: 'PREFERRED', confirmed: false },
    });
    existingTerms.add(term.toLowerCase());
    slogansCreated++;
  }

  if (productsCreated > 0 || slogansCreated > 0 || data.brandNotes) {
    const notes = data.brandNotes ? ` · бренд: ${data.brandNotes.slice(0, 200)}` : '';
    await prisma.brainChange.create({
      data: {
        clientId,
        kind: 'Графика',
        summary: `Од графики: ${productsCreated} продукти, ${slogansCreated} слогани (чекаат потврда)${notes}.`,
      },
    });
  }
  return { products: productsCreated, slogans: slogansCreated };
}

// Store the full scraped site text on the client — raw material the Client
// Analyst reads to build a richer profile (tone, USP, audience, testimonials).
export async function saveWebsiteText(clientId: string, websiteText: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  await prisma.client.update({ where: { id: clientId }, data: { websiteText } });
  await prisma.brainChange.create({
    data: { clientId, kind: 'Профил', summary: `Зачуван текст од веб-сајтот (${websiteText.length} знаци) за анализа.` },
  });
  return { saved: websiteText.length };
}
