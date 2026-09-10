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
    const secs = estimateSeconds(s.content);
    const meta = [s.type, s.actor, s.location].filter(Boolean).join(' · ');
    children.push(new Paragraph({ children: [new TextRun({ text: s.code, bold: true, size: 28 })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `СЦЕНАРИО ${String(s.nn).padStart(2, '0')} — ${s.title} (${meta} · ~${secs}s)`, bold: true })] }));
    children.push(new Paragraph({ text: '' }));
    s.content.frames.forEach((f, i) => children.push(...frameParagraphs(f, i)));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
