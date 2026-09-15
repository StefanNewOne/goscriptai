import type { FrameRole } from './types.js';

// Standard script format (PRD §11). content Json ↔ markdown normalization.
// Every frame has a role (ХООК/БОДИ/ЦТА); direction is separate from the line;
// a line always carries the actor name; "Монтажа:" on its own row; on-screen
// numbers also go into a table.

export interface ScriptLine {
  actor: string;
  text: string;
}

export interface ScriptTableRow {
  index: number;
  product: string; // spoken
  oldPrice?: string; // on screen
  newPrice?: string; // on screen
}

export interface Frame {
  role: FrameRole;
  direction: string; // stage direction
  lines: ScriptLine[];
  editing?: string; // "Монтажа: …"
  table?: ScriptTableRow[];
  subLabel?: string; // optional italic sub-label
}

export interface ScriptContent {
  frames: Frame[];
}

export interface ScriptHeaderMeta {
  nn: number;
  title: string;
  type: string; // localized type label
  avatar?: string;
  actor?: string;
  location?: string;
  seconds?: number;
  code: string;
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

export const FRAME_ROLES: readonly FrameRole[] = ['ХООК', 'БОДИ', 'ЦТА'];

export function isFrameRole(value: string): value is FrameRole {
  return (FRAME_ROLES as readonly string[]).includes(value);
}

// Average speaking rate for duration estimate (~2.5 words/sec, PRD §10).
export const WORDS_PER_SECOND = 2.5;

export function countSpokenWords(content: ScriptContent): number {
  let words = 0;
  for (const frame of content.frames) {
    for (const line of frame.lines) {
      words += line.text.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  return words;
}

export function estimateSeconds(content: ScriptContent): number {
  return Math.round(countSpokenWords(content) / WORDS_PER_SECOND);
}

function renderTable(rows: ScriptTableRow[]): string {
  const header = '| # | Производ (се изговара) | Стара цена (екран) | Нова цена (екран) |';
  const sep = '|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.index} | ${r.product} | ${r.oldPrice ?? ''} | ${r.newPrice ?? ''} |`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

// Render one frame to markdown in the standard format.
export function renderFrame(frame: Frame, index: number): string {
  const parts: string[] = [];
  const label = frame.subLabel ? ` — ${frame.subLabel}` : '';
  parts.push(`КАДАР ${index + 1} — ${frame.role}${label}`);
  if (frame.direction.trim()) parts.push(frame.direction.trim());
  if (frame.table && frame.table.length > 0) parts.push(renderTable(frame.table));
  for (const line of frame.lines) {
    parts.push(`**${line.actor}:** „${line.text}“`);
  }
  if (frame.editing && frame.editing.trim()) parts.push(`Монтажа: ${frame.editing.trim()}`);
  return parts.join('\n');
}

// Render the full script (header + frames) to markdown for docx/export.
export function renderScriptMarkdown(meta: ScriptHeaderMeta, content: ScriptContent): string {
  const metaBits = [meta.type, meta.avatar, meta.actor, meta.location]
    .filter(Boolean)
    .join(' · ');
  const secs = meta.durationSec ?? meta.seconds ?? estimateSeconds(content);
  const heading = `СЦЕНАРИО ${String(meta.nn).padStart(2, '0')} — ${meta.title} (${metaBits} · ~${secs}s)`;
  const codeLine = `Код: ${meta.code}`;

  // Shoot metadata (scenario-templejt) — only lines that have a value.
  const metaLines = [
    meta.format ? `Формат: ${meta.format}` : null,
    meta.vibe ? `Вајб: ${meta.vibe}` : null,
    meta.music ? `Музика: ${meta.music}` : null,
    meta.platforms?.length ? `Платформи: ${meta.platforms.join(' + ')}` : null,
    `Времетраење: ~${secs} сек`,
  ].filter(Boolean);

  const hooks = (meta.hookVariants ?? []).filter((h) => h.trim());
  const hookBlock = hooks.length
    ? `\nHook (${hooks.length} ${hooks.length === 1 ? 'варијанта' : 'варијанти'}):\n${hooks.map((h, i) => `Вар. ${i + 1}: „${h.trim()}“`).join('\n')}\n`
    : '';

  const frames = content.frames.map((f, i) => renderFrame(f, i)).join('\n\n');

  const captions = (meta.captions ?? []).filter((c) => c.trim());
  const captionBlock = captions.length
    ? `\n\nCaption (${captions.length} ${captions.length === 1 ? 'варијанта' : 'варијанти'}):\n${captions.map((c) => `„${c.trim()}“`).join('\n')}`
    : '';

  const noteBlock = meta.productionNote?.trim() ? `\n\nПродукциска забелешка:\n${meta.productionNote.trim()}` : '';

  return `${heading}\n${codeLine}\n${metaLines.join('\n')}\n${hookBlock}\n${frames}${captionBlock}${noteBlock}\n`;
}

// Validate a parsed/generated content object against the format rules.
export interface FormatWarning {
  code: 'NO_HOOK' | 'NO_CTA' | 'FRAME_WITHOUT_ROLE' | 'LINE_WITHOUT_ACTOR' | 'EMPTY';
  message: string;
  frame?: number;
}

export function validateContent(content: ScriptContent): FormatWarning[] {
  const warnings: FormatWarning[] = [];
  if (content.frames.length === 0) {
    warnings.push({ code: 'EMPTY', message: 'Нема ниту еден кадар.' });
    return warnings;
  }
  const hasHook = content.frames.some((f) => f.role === 'ХООК');
  const hasCta = content.frames.some((f) => f.role === 'ЦТА');
  if (!hasHook) warnings.push({ code: 'NO_HOOK', message: 'Не најдов кадар со улога ХООК.' });
  if (!hasCta) warnings.push({ code: 'NO_CTA', message: 'Не најдов кадар со улога ЦТА.' });
  content.frames.forEach((f, i) => {
    if (!isFrameRole(f.role)) {
      warnings.push({ code: 'FRAME_WITHOUT_ROLE', message: `Кадар ${i + 1} нема валидна улога.`, frame: i + 1 });
    }
    for (const line of f.lines) {
      if (!line.actor.trim()) {
        warnings.push({ code: 'LINE_WITHOUT_ACTOR', message: `Реплика во кадар ${i + 1} нема име на актер.`, frame: i + 1 });
      }
    }
  });
  return warnings;
}
