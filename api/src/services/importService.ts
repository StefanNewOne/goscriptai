import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { parseScriptText, parseRichScript } from '../import/parser.js';
import { buildCode, nextSequence, yymmFromDate } from '../domain/code.js';
import { renderScriptMarkdown, type ScriptContent } from '../domain/scriptFormat.js';
import type { ScriptType } from '../domain/types.js';

export function parse(text: string) {
  return parseScriptText(text);
}

interface CommitInput {
  clientId: string;
  title: string;
  type: ScriptType;
  code?: string;
  adDate?: Date;
  avatarId?: string;
  actorIds?: string[];
  locationId?: string;
  isStarExample?: boolean;
  content: ScriptContent;
  // Rich delivered-document fields (scenario-templejt) — present when importing
  // an old delivered script.
  format?: string;
  vibe?: string;
  music?: string;
  platforms?: string[];
  durationSec?: number;
  hookVariants?: string[];
  captions?: string[];
  productionNote?: string;
}

// Persist an imported script. Code == ad name (invariant 7); if omitted or
// taken, allocate the next free NN for the client+month.
export async function commit(input: CommitInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');

  const date = input.adDate ?? new Date();
  const yymm = yymmFromDate(date);

  let code = input.code;
  if (code) {
    const clash = await prisma.script.findUnique({ where: { code } });
    if (clash) throw new AppError('DUPLICATE_CODE', `Кодот ${code} е веќе зафатен.`);
  } else {
    const existing = await prisma.script.findMany({
      where: { clientId: input.clientId, code: { startsWith: `${client.code}-${yymm}-` } },
      select: { code: true },
    });
    const nn = nextSequence(existing.map((e) => e.code), client.code, yymm);
    code = buildCode({ clientCode: client.code, yymm, nn });
  }

  const nn = Number.parseInt(code.split('-')[2] ?? '1', 10);
  const rich = {
    format: input.format ?? null,
    vibe: input.vibe ?? null,
    music: input.music ?? null,
    platforms: input.platforms ?? [],
    durationSec: input.durationSec != null ? Math.round(input.durationSec) : null,
    hookVariants: input.hookVariants ?? [],
    captions: input.captions ?? [],
    productionNote: input.productionNote ?? null,
  };
  const markdown = renderScriptMarkdown(
    { nn, title: input.title, type: input.type, code, ...rich },
    input.content,
  );

  return prisma.script.create({
    data: {
      clientId: input.clientId,
      code,
      title: input.title,
      type: input.type,
      language: client.language,
      avatarId: input.avatarId,
      actorIds: input.actorIds ?? [],
      locationId: input.locationId,
      content: input.content as never,
      markdown,
      status: 'APPROVED',
      isStarExample: input.isStarExample ?? false,
      source: 'IMPORTED',
      ...rich,
    },
  });
}

// Parse a delivered scenario document (text) into a rich commit input. Used by
// the docx/paste import so old scripts land WITH their hook/caption variants and
// production note — the parts a video can never recover.
export function parseRich(text: string) {
  return parseRichScript(text);
}
