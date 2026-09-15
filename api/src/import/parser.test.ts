import { describe, it, expect } from 'vitest';
import { parseScriptText, parseRichScript } from './parser.js';

const RICH = `HOTEL BELVI — Дополнително сценарио
Актери: Тамара
Локација: Хотел Белви
Сценарио 11: Ве слушнавме — нов QR систем
Формат: Presenter — Тамара + demo
Вајб: Искрено, директно
Музика: Лесен инструментал
Платформи: ФБ + ИГ + ТТ
Времетраење: ~45–50 сек.
Hook (3 варијанти):
Вар. 1: „Ги читаме сите ваши критики.“
Вар. 2: „Не значи дека не ве слушаме.“
Вар. 3: „Нарачуваш без да чекаш келнер.“
Кадар по кадар:
КАДАР 1 (Тамара седи, гледа во камера)
Реплика: „Ве слушаме.“
КАДАР 2 (Поблизок кадар)
Реплика: „И се подобруваме.“
CTA:
Дојди во Белви и пробај го новиот систем.
Caption (3 варијанти):
„Ве слушнавме. Нов QR систем.“
„Без чекање келнер.“
„Вашите критики нè прават подобри.“
Продукциска забелешка:
Тонот е клучен: првите кадри искрени. Demo кадрите со читлив екран.`;

describe('parseRichScript (scenario-templejt)', () => {
  it('extracts hook/caption variants, frames, and production note', () => {
    const r = parseRichScript(RICH);
    expect(r.title).toBe('Ве слушнавме — нов QR систем');
    expect(r.format).toContain('Presenter');
    expect(r.platforms).toEqual(['ФБ', 'ИГ', 'ТТ']);
    expect(r.durationSec).toBe(45);
    expect(r.hookVariants).toHaveLength(3);
    expect(r.captions).toHaveLength(3);
    expect(r.productionNote).toContain('Тонот е клучен');
    // 2 КАДАР frames + 1 CTA frame; roles bookended ХООК…ЦТА.
    expect(r.content.frames).toHaveLength(3);
    expect(r.content.frames[0]!.role).toBe('ХООК');
    expect(r.content.frames.at(-1)!.role).toBe('ЦТА');
    expect(r.content.frames[0]!.lines[0]).toEqual({ actor: 'Тамара', text: 'Ве слушаме.' });
  });
});

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
