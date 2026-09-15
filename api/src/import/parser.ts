import {
  type ScriptContent,
  type Frame,
  type ScriptLine,
  type FormatWarning,
  isFrameRole,
  validateContent,
} from '../domain/scriptFormat.js';
import type { FrameRole } from '../domain/types.js';

// Import parser (README §12). Splits raw text into frames: a line containing
// "КАДАР" opens a frame; a parenthetical / non-quoted line is direction;
// `Name: „…“` lines are actor lines; "Монтажа:" is editing. Role comes from the
// header when present, else ХООК for the first frame and ЦТА for the last.
// Production also handles docx + multi-file batches (server-side) — this covers
// the paste/markdown path.

// Note: no `\b` after КАДАР — in non-unicode JS regex Cyrillic isn't `\w`, so a
// word boundary never matches between a Cyrillic letter and a space.
const FRAME_HEADER_RE = /^\s*(?:#+\s*)?КАДАР(?=\s|$|[—\-:])/i;
const ROLE_RE = /(ХООК|БОДИ|ЦТА)/i;
const LINE_RE = /^\s*(?:\*\*)?([^:*]{1,40}?)(?:\*\*)?\s*[:：]\s*[„"“]?(.+?)[“"”]?\s*$/;
const EDITING_RE = /^\s*(?:Монтажа|Montaza)\s*[:：]\s*(.+)$/i;
const PAREN_RE = /^\s*\((.+)\)\s*$/;

interface RawFrame {
  header: string;
  bodyLines: string[];
}

function splitIntoRawFrames(text: string): RawFrame[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const frames: RawFrame[] = [];
  let current: RawFrame | null = null;
  for (const line of lines) {
    if (FRAME_HEADER_RE.test(line)) {
      if (current) frames.push(current);
      current = { header: line.trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
    // lines before the first КАДАР (title, code) are ignored here
  }
  if (current) frames.push(current);
  return frames;
}

function roleForFrame(header: string, index: number, total: number): FrameRole {
  const m = header.match(ROLE_RE);
  if (m) {
    const up = m[1]!.toUpperCase();
    if (isFrameRole(up)) return up;
  }
  if (index === 0) return 'ХООК';
  if (index === total - 1) return 'ЦТА';
  return 'БОДИ';
}

function parseFrame(raw: RawFrame, index: number, total: number): Frame {
  const role = roleForFrame(raw.header, index, total);
  const directionParts: string[] = [];
  const lines: ScriptLine[] = [];
  let editing: string | undefined;

  for (const rawLine of raw.bodyLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const edit = line.match(EDITING_RE);
    if (edit) {
      editing = edit[1]!.trim();
      continue;
    }
    const paren = line.match(PAREN_RE);
    if (paren) {
      directionParts.push(paren[1]!.trim());
      continue;
    }
    const actorLine = line.match(LINE_RE);
    if (actorLine && /[„"“]/.test(line)) {
      lines.push({ actor: actorLine[1]!.trim(), text: actorLine[2]!.trim() });
      continue;
    }
    // Anything else is treated as stage direction.
    directionParts.push(line);
  }

  return {
    role,
    direction: directionParts.join(' '),
    lines,
    ...(editing ? { editing } : {}),
  };
}

export interface ParseResult {
  content: ScriptContent;
  warnings: FormatWarning[];
}

export function parseScriptText(text: string): ParseResult {
  const rawFrames = splitIntoRawFrames(text);
  const frames = rawFrames.map((raw, i) => parseFrame(raw, i, rawFrames.length));
  const content: ScriptContent = { frames };
  return { content, warnings: validateContent(content) };
}

export interface RichParseResult extends ParseResult {
  title?: string;
  actors: string[];
  format?: string;
  vibe?: string;
  music?: string;
  platforms: string[];
  durationSec?: number;
  hookVariants: string[];
  captions: string[];
  productionNote?: string;
}

const stripQuotes = (s: string) =>
  s
    .replace(/^[„"“'\s]+/, '')
    .replace(/[“"”'\s]+$/, '')
    .trim();

// Parse the DELIVERED scenario document (scenario-templejt): metadata + 3 hook
// variants + frames (Кадар по кадар / Реплика) + CTA + 3 captions + production
// note. Falls back gracefully — sections it doesn't find stay empty; if there's
// no "Кадар по кадар" marker it still picks up КАДАР frames anywhere.
export function parseRichScript(text: string): RichParseResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: RichParseResult = { content: { frames: [] }, warnings: [], actors: [], platforms: [], hookVariants: [], captions: [] };
  const frames: Frame[] = [];
  const noteLines: string[] = [];
  const ctaLines: string[] = [];
  let cur: { direction: string[]; lines: ScriptLine[] } | null = null;
  let state: 'none' | 'hooks' | 'frames' | 'cta' | 'captions' | 'note' = 'none';
  const actor = () => out.actors[0] || 'Актер';
  const flush = () => {
    if (cur) {
      frames.push({ role: 'БОДИ', direction: cur.direction.join(' ').trim(), lines: cur.lines });
      cur = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^Актери\s*[:：]\s*(.+)$/i))) {
      out.actors = m[1]!.split(/[,·+/]/).map((s) => s.trim()).filter(Boolean);
      state = 'none';
      continue;
    }
    if (/^Локација\s*[:：]/i.test(line) || /^Клиент\s*[:：]/i.test(line) || /^Формат на пишување\s*[:：]/i.test(line)) {
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Сценарио\s+\d+\s*[:：]\s*(.+)$/i))) {
      out.title = m[1]!.trim();
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Формат\s*[:：]\s*(.+)$/i))) {
      out.format = m[1]!.trim();
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Вајб\s*[:：]\s*(.+)$/i))) {
      out.vibe = m[1]!.trim();
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Музика\s*[:：]\s*(.+)$/i))) {
      out.music = m[1]!.trim();
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Платформи\s*[:：]\s*(.+)$/i))) {
      out.platforms = m[1]!.split(/[+,·/]/).map((s) => s.trim()).filter(Boolean);
      state = 'none';
      continue;
    }
    if ((m = line.match(/^Времетраење\s*[:：]\s*(.+)$/i))) {
      const n = m[1]!.match(/\d+/);
      if (n) out.durationSec = Number.parseInt(n[0], 10);
      state = 'none';
      continue;
    }
    if (/^Hook\b/i.test(line) && /варијант/i.test(line)) {
      state = 'hooks';
      continue;
    }
    if (/^Кадар по кадар\s*[:：]/i.test(line)) {
      state = 'frames';
      continue;
    }
    if (/^CTA\s*[:：]/i.test(line)) {
      flush();
      state = 'cta';
      const after = line.replace(/^CTA\s*[:：]/i, '').trim();
      if (after) ctaLines.push(stripQuotes(after));
      continue;
    }
    if (/^Caption\b/i.test(line) && /варијант/i.test(line)) {
      flush();
      state = 'captions';
      continue;
    }
    if (/^Продукциска забелешка\s*[:：]/i.test(line)) {
      flush();
      state = 'note';
      continue;
    }

    if (state === 'hooks') {
      const h = line.match(/^Вар\.?\s*\d+\s*[:：]\s*(.+)$/i);
      out.hookVariants.push(stripQuotes(h ? h[1]! : line));
      continue;
    }
    if (state === 'captions') {
      out.captions.push(stripQuotes(line));
      continue;
    }
    if (state === 'note') {
      noteLines.push(line);
      continue;
    }
    if (state === 'cta') {
      ctaLines.push(stripQuotes(line));
      continue;
    }
    if (state === 'frames' || FRAME_HEADER_RE.test(line)) {
      if (FRAME_HEADER_RE.test(line)) {
        flush();
        const paren = line.match(/\((.+)\)/);
        cur = { direction: paren ? [paren[1]!.trim()] : [], lines: [] };
        state = 'frames';
        continue;
      }
      const rep = line.match(/^Реплика\s*[:：]\s*(.+)$/i);
      if (rep && cur) {
        cur.lines.push({ actor: actor(), text: stripQuotes(rep[1]!) });
        continue;
      }
      if (cur) cur.direction.push(line);
      continue;
    }
  }
  flush();
  if (ctaLines.length) frames.push({ role: 'ЦТА', direction: '', lines: [{ actor: actor(), text: ctaLines.join(' ') }] });
  // Role by position: first is the hook, last (if not already ЦТА) is the CTA.
  frames.forEach((f, i) => {
    if (i === 0) f.role = 'ХООК';
    else if (i === frames.length - 1 && f.role !== 'ЦТА') f.role = 'ЦТА';
  });
  if (noteLines.length) out.productionNote = noteLines.join('\n').trim();
  out.content = { frames };
  out.warnings = validateContent(out.content);
  return out;
}
