import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { buildSetDocx, type ExportScript } from '../lib/docx.js';
import { moveSet } from './setService.js';
import type { ScriptContent } from '../domain/scriptFormat.js';

const EXPORT_DIR = join(process.cwd(), 'exports');

const MONTHS = ['Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни', 'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];

// Export the approved set to .docx + .md. Blocked until every script is APPROVED.
export async function exportSet(setId: string) {
  const set = await prisma.scriptSet.findUnique({ where: { id: setId }, include: { client: true, scripts: { orderBy: { code: 'asc' } } } });
  if (!set) throw new AppError('NOT_FOUND', 'Сетот не постои.');
  if (set.status !== 'APPROVED' && set.status !== 'EXPORTED') {
    throw new AppError('WRONG_STATUS', 'Сите сценарија мора да се одобрени пред експорт.');
  }

  const actorIds = [...new Set(set.scripts.flatMap((s) => s.actorIds))];
  const locationIds = [...new Set(set.scripts.map((s) => s.locationId).filter(Boolean) as string[])];
  const actors = await prisma.actor.findMany({ where: { id: { in: actorIds } } });
  const locations = await prisma.location.findMany({ where: { id: { in: locationIds } } });
  const actorName = (id?: string | null) => actors.find((a) => a.id === id)?.name;
  const locationName = (id?: string | null) => locations.find((l) => l.id === id)?.name;

  const exportScripts: ExportScript[] = set.scripts.map((s) => ({
    nn: Number.parseInt(s.code.split('-')[2] ?? '1', 10),
    code: s.code,
    title: s.title,
    type: s.type,
    actor: actorName(s.actorIds[0]),
    location: locationName(s.locationId),
    content: s.content as unknown as ScriptContent,
  }));

  const now = new Date();
  const monthTitle = `${set.client.name} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()} Сценарија`;
  const subtitle = `${set.scripts.length} сценарија · ${set.client.code}-${set.yymm}`;

  await mkdir(EXPORT_DIR, { recursive: true });
  const base = `${set.client.code}-${set.yymm}-${set.id.slice(-6)}`;
  const docxPath = join(EXPORT_DIR, `${base}.docx`);
  const mdPath = join(EXPORT_DIR, `${base}.md`);

  const buffer = await buildSetDocx(monthTitle, subtitle, exportScripts);
  await writeFile(docxPath, buffer);
  const md = `# ${monthTitle}\n\n${subtitle}\n\n` + set.scripts.map((s) => s.markdown).join('\n\n---\n\n');
  await writeFile(mdPath, md, 'utf8');

  await prisma.scriptSet.update({ where: { id: setId }, data: { exportPath: docxPath, exportMdPath: mdPath } });
  await prisma.script.updateMany({ where: { setId }, data: { status: 'EXPORTED' } });
  if (set.status === 'APPROVED') await moveSet(setId, ['APPROVED'], 'EXPORTED');

  return { docxPath, mdPath, base };
}
