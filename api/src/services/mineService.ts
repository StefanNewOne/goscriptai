import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

// Mine the client's confirmed star-example scripts for reusable Brain material
// and store it as PROPOSALS (confirmed=false) — never active (invariant 2). The
// scriptwriter confirms each in the Actors / Glossary tabs.
//   POST /clients/:id/mine
// Currently produces: Actor proposals (distinct speaker labels across scripts)
// and Glossary PRODUCT_NAME proposals (from script product mentions + catalog).

// Speaker labels that are too generic to become a named actor on their own.
const GENERIC_SPEAKER = new Set([
  '', 'актер', 'глас', 'наратор', 'девојка', 'момче', 'маж', 'жена', 'дете', 'клиент', 'купувач',
]);

// Collapse delivery-mode variants onto one person: "Стефан (voiceover)",
// "Стефан (глас)", "Стефан (offscreen)" → "Стефан", so a single actor proposal
// is created instead of near-duplicates.
function normalizeSpeaker(raw: string): string {
  return raw
    .replace(/\((?:voice\s?over|voiceover|глас|off\s?screen|offscreen|vo|зад\s?кадар)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Line {
  actor?: string;
  text?: string;
}
interface FrameLike {
  role?: string;
  direction?: string;
  lines?: Line[];
}

export async function mineFromScripts(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');

  const scripts = await prisma.script.findMany({
    where: { clientId, isStarExample: true },
    select: { content: true },
  });

  // ── Actors: distinct speaker labels across all star scripts ──────────
  const speakers = new Map<string, { display: string; n: number }>();
  for (const s of scripts) {
    const frames = ((s.content as { frames?: FrameLike[] } | null)?.frames ?? []) as FrameLike[];
    for (const f of frames) {
      for (const ln of f.lines ?? []) {
        const name = normalizeSpeaker(String(ln.actor ?? ''));
        const key = name.toLowerCase();
        if (GENERIC_SPEAKER.has(key)) continue;
        const cur = speakers.get(key);
        if (cur) cur.n++;
        else speakers.set(key, { display: name, n: 1 });
      }
    }
  }
  const existingActors = new Set(
    (await prisma.actor.findMany({ where: { clientId }, select: { name: true } })).map((a) => a.name.toLowerCase()),
  );
  let actorsCreated = 0;
  for (const { display, n } of speakers.values()) {
    if (existingActors.has(display.toLowerCase())) continue;
    await prisma.actor.create({
      data: {
        clientId,
        name: display,
        role: '',
        confirmed: false,
        notes: `Извлечен од ${n} ${n === 1 ? 'сценарио' : 'сценарија'}.`,
      },
    });
    actorsCreated++;
  }

  // ── Glossary PRODUCT_NAME: script mentions + confirmed catalog ────────
  const mentions = await prisma.mention.findMany({
    where: { clientId, status: 'CONFIRMED' },
    select: { name: true, essence: true },
  });
  const products = await prisma.product.findMany({ where: { clientId }, select: { name: true, usp: true } });
  const terms = new Map<string, { term: string; meaning: string }>();
  for (const m of mentions) {
    const t = m.name.trim();
    if (t) terms.set(t.toLowerCase(), { term: t, meaning: m.essence ?? '' });
  }
  for (const p of products) {
    const t = p.name.trim();
    if (t && !terms.has(t.toLowerCase())) terms.set(t.toLowerCase(), { term: t, meaning: p.usp ?? '' });
  }
  const existingTerms = new Set(
    (await prisma.glossaryTerm.findMany({ where: { clientId }, select: { term: true } })).map((g) => g.term.toLowerCase()),
  );
  let glossaryCreated = 0;
  for (const { term, meaning } of terms.values()) {
    if (existingTerms.has(term.toLowerCase())) continue;
    await prisma.glossaryTerm.create({
      data: { clientId, language: client.language, term, meaning, kind: 'PRODUCT_NAME', confirmed: false },
    });
    glossaryCreated++;
  }

  if (actorsCreated > 0 || glossaryCreated > 0) {
    await prisma.brainChange.create({
      data: {
        clientId,
        kind: 'Извлекување',
        summary: `Извлечени од сценарија: ${actorsCreated} актери, ${glossaryCreated} термини (чекаат потврда).`,
      },
    });
  }

  return { actors: actorsCreated, glossary: glossaryCreated, scriptsScanned: scripts.length };
}

export interface HookItem {
  scriptCode: string;
  scriptTitle: string;
  direction: string;
  text: string;
}

// A swipe file of proven hooks: every ХООК frame from the client's confirmed
// star scripts, newest first. Pure read — a creativity source for the
// scriptwriter (and, in a later step, an input to the Creative Director).
export async function listHooks(clientId: string): Promise<HookItem[]> {
  const scripts = await prisma.script.findMany({
    where: { clientId, isStarExample: true },
    select: { code: true, title: true, content: true },
    orderBy: { createdAt: 'desc' },
  });
  const hooks: HookItem[] = [];
  for (const s of scripts) {
    const frames = ((s.content as { frames?: FrameLike[] } | null)?.frames ?? []) as FrameLike[];
    for (const f of frames) {
      if (f.role !== 'ХООК') continue;
      const text = (f.lines ?? [])
        .map((l) => String(l.text ?? '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      const direction = String(f.direction ?? '').trim();
      if (!text && !direction) continue;
      hooks.push({ scriptCode: s.code, scriptTitle: s.title ?? '', direction, text });
    }
  }
  return hooks;
}
