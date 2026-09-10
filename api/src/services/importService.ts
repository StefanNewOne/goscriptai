import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { parseScriptText } from '../import/parser.js';
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
  const markdown = renderScriptMarkdown(
    { nn, title: input.title, type: input.type, code },
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
    },
  });
}
