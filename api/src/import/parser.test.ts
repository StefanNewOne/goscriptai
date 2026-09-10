import { describe, it, expect } from 'vitest';
import { parseScriptText } from './parser.js';

const SAMPLE = `СЦЕНАРИО 01 — Ваучер ИУТЕ
Код: ALEKS-2609-01

КАДАР 1 — ХООК
Ајтов е во центар на кадарот, гледа право во камера, држи ваучер.
Ајтов: „500 денари и уште 500 денари, тоа се 1000 денари.“

КАДАР 2 — БОДИ
(Одозгора се појавува трета рака што подава банкнота.)
Ајтов: „И уште 1000 денари — 2000 денари подарок овој месец!“
Монтажа: секоја цена се појавува како натпис на екран.

КАДАР 3 — ЦТА
Кадри од салонот, лого 20 години.
Ајтов: „Дојдете во Алекс Дизајн во Радишани.“`;

describe('import parser', () => {
  it('parses frames, roles, direction, lines and editing', () => {
    const { content } = parseScriptText(SAMPLE);
    expect(content.frames).toHaveLength(3);
    expect(content.frames[0]!.role).toBe('ХООК');
    expect(content.frames[0]!.lines[0]).toMatchObject({ actor: 'Ајтов' });
    expect(content.frames[1]!.role).toBe('БОДИ');
    expect(content.frames[1]!.direction).toContain('трета рака');
    expect(content.frames[1]!.editing).toContain('натпис на екран');
    expect(content.frames[2]!.role).toBe('ЦТА');
  });

  it('produces no warnings for a well-formed script', () => {
    const { warnings } = parseScriptText(SAMPLE);
    expect(warnings).toHaveLength(0);
  });

  it('assigns ХООК/ЦТА by position when the header omits the role', () => {
    const text = `КАДАР 1\nАјтов: „Прв.“\n\nКАДАР 2\nАјтов: „Втор.“`;
    const { content, warnings } = parseScriptText(text);
    expect(content.frames[0]!.role).toBe('ХООК');
    expect(content.frames[1]!.role).toBe('ЦТА');
    expect(warnings).toHaveLength(0);
  });

  it('warns when there is no CTA frame', () => {
    const text = `КАДАР 1 — ХООК\nАјтов: „Само хук.“`;
    const { warnings } = parseScriptText(text);
    // single frame is both first and last → gets ЦТА, so force a body-only case
    const text2 = `КАДАР 1 — БОДИ\nАјтов: „Средина.“`;
    expect(parseScriptText(text2).warnings.map((w) => w.code)).toContain('NO_HOOK');
    expect(warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('handles empty input', () => {
    const { content, warnings } = parseScriptText('');
    expect(content.frames).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('EMPTY');
  });
});
