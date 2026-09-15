import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { scriptLineSet, jaccard } from '../domain/similarity.js';
import type { ScriptContent } from '../domain/scriptFormat.js';

interface RichView {
  hookVariants: string[];
  captions: string[];
  productionNote: string | null;
}

// Which rich fields `a` has that `b` lacks — the delta worth carrying over.
function richDelta(a: RichView, b: RichView) {
  return {
    hookVariants: a.hookVariants.length > 0 && b.hookVariants.length === 0,
    captions: a.captions.length > 0 && b.captions.length === 0,
    productionNote: !!a.productionNote && !b.productionNote,
  };
}

// Find the client's scripts most similar to `scriptId` by replica-line overlap.
// Use case: after importing an old delivered doc, find its video-derived twin and
// see what each carries that the other lacks (invariant: nothing auto-merges).
export async function findSimilar(scriptId: string) {
  const target = await prisma.script.findUnique({ where: { id: scriptId } });
  if (!target) throw new AppError('NOT_FOUND', 'Сценариото не постои.');
  const others = await prisma.script.findMany({
    where: { clientId: target.clientId, id: { not: scriptId } },
    select: { id: true, code: true, title: true, source: true, content: true, hookVariants: true, captions: true, productionNote: true },
  });
  const tSet = scriptLineSet(target.content as unknown as ScriptContent);
  const tView: RichView = { hookVariants: target.hookVariants, captions: target.captions, productionNote: target.productionNote };
  return others
    .map((o) => ({ o, sim: jaccard(tSet, scriptLineSet(o.content as unknown as ScriptContent)) }))
    .filter((m) => m.sim >= 0.15)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
    .map(({ o, sim }) => {
      const oView: RichView = { hookVariants: o.hookVariants, captions: o.captions, productionNote: o.productionNote };
      return {
        id: o.id,
        code: o.code,
        title: o.title,
        source: o.source,
        similarity: Math.round(sim * 100),
        targetAdds: richDelta(tView, oView), // what the imported doc adds vs this match
        matchAdds: richDelta(oView, tView),
      };
    });
}

// Carry the rich fields the target LACKS over from a source script (human-chosen,
// invariant 11 trail). Only fills gaps — never overwrites existing content.
export async function enrichFromSource(targetId: string, sourceId: string) {
  const [target, source] = await Promise.all([
    prisma.script.findUnique({ where: { id: targetId } }),
    prisma.script.findUnique({ where: { id: sourceId } }),
  ]);
  if (!target || !source) throw new AppError('NOT_FOUND', 'Сценариото не постои.');
  const data: Record<string, unknown> = {};
  if (target.hookVariants.length === 0 && source.hookVariants.length) data.hookVariants = source.hookVariants;
  if (target.captions.length === 0 && source.captions.length) data.captions = source.captions;
  if (!target.productionNote && source.productionNote) data.productionNote = source.productionNote;
  if (!target.format && source.format) data.format = source.format;
  if (!target.vibe && source.vibe) data.vibe = source.vibe;
  if (!target.music && source.music) data.music = source.music;
  if (target.platforms.length === 0 && source.platforms.length) data.platforms = source.platforms;
  if (target.durationSec == null && source.durationSec != null) data.durationSec = source.durationSec;
  const fields = Object.keys(data);
  if (fields.length === 0) return { updated: false, fields };
  await prisma.script.update({ where: { id: targetId }, data });
  await prisma.brainChange.create({
    data: { clientId: target.clientId, kind: 'Сценарио', summary: `${target.code} збогатено од ${source.code} (${fields.join(', ')}).` },
  });
  return { updated: true, fields };
}
