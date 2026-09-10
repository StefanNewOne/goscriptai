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
