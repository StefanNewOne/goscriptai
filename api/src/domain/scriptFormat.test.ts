import { describe, it, expect } from 'vitest';
import {
  renderFrame,
  renderScriptMarkdown,
  validateContent,
  countSpokenWords,
  estimateSeconds,
  isFrameRole,
  type ScriptContent,
  type Frame,
} from './scriptFormat.js';

const hookFrame: Frame = {
  role: 'ХООК',
  direction: 'Ајтов држи ваучер и гледа во камера.',
  lines: [{ actor: 'Ајтов', text: 'Три илјади денари попуст, само овој викенд.' }],
};

const bodyFrame: Frame = {
  role: 'БОДИ',
  direction: 'Кадри од салонот.',
  lines: [{ actor: 'Ајтов', text: 'Ова е нашата понуда за тебе.' }],
  editing: 'инсерти од производи',
  table: [{ index: 1, product: 'Софа', oldPrice: '20.000', newPrice: '17.000' }],
};

const ctaFrame: Frame = {
  role: 'ЦТА',
  direction: 'Лого на екран.',
  lines: [{ actor: 'Ајтов', text: 'Пиши ни порака сега.' }],
};

const content: ScriptContent = { frames: [hookFrame, bodyFrame, ctaFrame] };

describe('scriptFormat', () => {
  it('detects frame roles', () => {
    expect(isFrameRole('ХООК')).toBe(true);
    expect(isFrameRole('INTRO')).toBe(false);
  });

  it('renders a frame with role, direction, actor line', () => {
    const md = renderFrame(hookFrame, 0);
    expect(md).toContain('КАДАР 1 — ХООК');
    expect(md).toContain('**Ајтов:** „Три илјади');
  });

  it('renders a frame with table, editing and sub-label', () => {
    const md = renderFrame({ ...bodyFrame, subLabel: 'набројување' }, 1);
    expect(md).toContain('КАДАР 2 — БОДИ — набројување');
    expect(md).toContain('| # | Производ');
    expect(md).toContain('Монтажа: инсерти');
  });

  it('renders a table row with missing prices and a frame with empty direction/editing', () => {
    const frame: Frame = {
      role: 'БОДИ',
      direction: '   ',
      lines: [{ actor: 'Јуле', text: 'Погледни го асортиманот.' }],
      editing: '  ',
      table: [{ index: 1, product: 'Стол' }],
    };
    const md = renderFrame(frame, 0);
    expect(md).not.toContain('Монтажа:');
    expect(md).toContain('| 1 | Стол |  |  |');
  });

  it('counts spoken words and estimates seconds', () => {
    const words = countSpokenWords(content);
    expect(words).toBeGreaterThan(0);
    expect(estimateSeconds(content)).toBe(Math.round(words / 2.5));
  });

  it('renders full markdown with header and code', () => {
    const md = renderScriptMarkdown(
      { nn: 1, title: 'Ваучер ИУТЕ', type: 'Продажно', avatar: 'Штедлив', actor: 'Ајтов', location: 'Салон', code: 'ALEKS-2609-01' },
      content,
    );
    expect(md).toContain('СЦЕНАРИО 01 — Ваучер ИУТЕ');
    expect(md).toContain('Код: ALEKS-2609-01');
    expect(md).toContain('~');
  });

  it('renders full markdown falling back to estimated seconds', () => {
    const md = renderScriptMarkdown({ nn: 2, title: 'Тест', type: 'Едукативно', code: 'ALEKS-2609-02' }, content);
    expect(md).toContain('СЦЕНАРИО 02 — Тест');
  });

  it('renders the rich delivered-document fields when present (F8)', () => {
    const md = renderScriptMarkdown(
      {
        nn: 3,
        title: 'Богато',
        type: 'Продажно',
        code: 'ALEKS-2609-03',
        format: 'Presenter + demo',
        vibe: 'топло',
        music: 'акустика',
        platforms: ['Reels', 'TikTok'],
        hookVariants: ['Хук А', 'Хук Б'],
        captions: ['Кеп 1'],
        productionNote: 'снимај на природна светлина',
      },
      content,
    );
    expect(md).toContain('Формат: Presenter + demo');
    expect(md).toContain('Платформи: Reels + TikTok');
    expect(md).toContain('Хук А');
    expect(md).toContain('Caption');
    expect(md).toContain('Продукциска забелешка:');
    expect(md).toContain('снимај на природна светлина');
  });

  it('validates a well-formed script with no warnings', () => {
    expect(validateContent(content)).toHaveLength(0);
  });

  it('warns on empty content', () => {
    const w = validateContent({ frames: [] });
    expect(w).toEqual([{ code: 'EMPTY', message: 'Нема ниту еден кадар.' }]);
  });

  it('warns on missing hook/cta', () => {
    const w = validateContent({ frames: [bodyFrame] });
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(['NO_HOOK', 'NO_CTA']));
  });

  it('warns on invalid role and missing actor', () => {
    const bad: ScriptContent = {
      frames: [
        { role: 'INTRO' as unknown as Frame['role'], direction: 'x', lines: [{ actor: '', text: 'hi' }] },
      ],
    };
    const codes = validateContent(bad).map((x) => x.code);
    expect(codes).toContain('FRAME_WITHOUT_ROLE');
    expect(codes).toContain('LINE_WITHOUT_ACTOR');
  });
});
