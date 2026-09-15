import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import type { ScriptContent, Frame } from '../domain/scriptFormat.js';
import { estimateSeconds } from '../domain/scriptFormat.js';

export interface ExportScript {
  nn: number;
  code: string;
  title: string;
  type: string;
  actor?: string;
  location?: string;
  content: ScriptContent;
  // Rich delivered-document fields (scenario-templejt).
  format?: string | null;
  vibe?: string | null;
  music?: string | null;
  platforms?: string[];
  durationSec?: number | null;
  hookVariants?: string[];
  captions?: string[];
  productionNote?: string | null;
}

function frameParagraphs(frame: Frame, index: number): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({ children: [new TextRun({ text: `КАДАР ${index + 1} — ${frame.role}`, bold: true })] }));
  if (frame.direction.trim()) out.push(new Paragraph({ children: [new TextRun({ text: frame.direction.trim(), italics: true })] }));
  for (const line of frame.lines) {
    out.push(new Paragraph({ children: [new TextRun({ text: `${line.actor}: `, bold: true }), new TextRun({ text: `„${line.text}“` })] }));
  }
  if (frame.editing) out.push(new Paragraph({ children: [new TextRun({ text: `Монтажа: ${frame.editing}`, italics: true })] }));
  out.push(new Paragraph({ text: '' }));
  return out;
}

// Standard document (PRD §11): one block per script, code shown large.
export async function buildSetDocx(title: string, subtitle: string, scripts: ExportScript[]): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: subtitle, color: '5A6270' })] }),
    new Paragraph({ text: '' }),
  ];

  for (const s of scripts) {
    const secs = s.durationSec ?? estimateSeconds(s.content);
    const meta = [s.type, s.actor, s.location].filter(Boolean).join(' · ');
    children.push(new Paragraph({ children: [new TextRun({ text: s.code, bold: true, size: 28 })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `СЦЕНАРИО ${String(s.nn).padStart(2, '0')} — ${s.title} (${meta} · ~${secs}s)`, bold: true })] }));

    // Shoot metadata (scenario-templejt).
    const info = [
      s.format ? `Формат: ${s.format}` : null,
      s.vibe ? `Вајб: ${s.vibe}` : null,
      s.music ? `Музика: ${s.music}` : null,
      s.platforms?.length ? `Платформи: ${s.platforms.join(' + ')}` : null,
      `Времетраење: ~${secs} сек`,
    ].filter((x): x is string => !!x);
    for (const line of info) children.push(new Paragraph({ children: [new TextRun({ text: line, color: '5A6270' })] }));

    const hooks = (s.hookVariants ?? []).filter((h) => h.trim());
    if (hooks.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Hook (${hooks.length} варијанти):`, bold: true })] }));
      hooks.forEach((h, i) => children.push(new Paragraph({ children: [new TextRun({ text: `Вар. ${i + 1}: „${h.trim()}“` })] })));
    }
    children.push(new Paragraph({ text: '' }));

    s.content.frames.forEach((f, i) => children.push(...frameParagraphs(f, i)));

    const captions = (s.captions ?? []).filter((c) => c.trim());
    if (captions.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Caption (${captions.length} варијанти):`, bold: true })] }));
      captions.forEach((c) => children.push(new Paragraph({ children: [new TextRun({ text: `„${c.trim()}“` })] })));
    }
    if (s.productionNote?.trim()) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Продукциска забелешка:', bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: s.productionNote.trim(), italics: true })] }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
