import { describe, it, expect } from 'vitest';
import {
  avatarBrief,
  scriptSkeleton,
  buildCreativeDirectorPrompt,
  buildWriterPrompt,
  buildCriticPrompt,
  type CreativeDirectorInput,
  type WriterInput,
} from './prompts.js';

const cdBase: CreativeDirectorInput = {
  clientName: 'Алекс',
  language: 'MK',
  requested: 3,
  product: 'Роденденски попусти',
  avatars: [{ id: 'av1', name: 'Марија', profile: { pain: 'нема време', desire: 'брзо решение' } }],
  actors: [{ id: 'ac1', name: 'Стефан', languages: ['MK', 'SQ'] }],
  locations: [{ id: 'lo1', name: 'Студио' }],
  preferred: ['Брзо (услуга)'],
  banned: ['најдобри на пазарот'],
  voiceCard: 'Топол, разговорен тон.',
  hooks: [{ text: 'Ти се случило ова?', direction: 'крупен план' }],
  insights: [{ text: 'Локалците веруваат на препорака.' }],
  doNotCopy: ['генеричен корпоративен спот'],
};

const writerBase: WriterInput = {
  language: 'MK',
  hook: 'Ти се случило ова?',
  avatar: { name: 'Марија', profile: { pain: 'нема време' } },
  product: 'Роденденски попусти',
  catalog: ['Пакет А: брза достава'],
  actorName: 'Стефан',
  actorStyle: 'смирен',
  actorCannotDo: ['пее'],
  preferred: ['Брзо (услуга)'],
  banned: ['најдобри на пазарот'],
  voiceCard: 'Топол, разговорен тон.',
  skeletons: ['ХООК — 1 реплика (~8 збора)'],
};

describe('avatarBrief', () => {
  it('joins present profile fields, skips empty ones', () => {
    expect(avatarBrief({ profile: { pain: 'X', desire: 'Y' } })).toBe('болка: X; сака: Y');
    expect(avatarBrief({ profile: {} })).toBe('');
    expect(avatarBrief({})).toBe('');
  });
});

describe('scriptSkeleton', () => {
  it('maps frames to a text-free beat map', () => {
    const sk = scriptSkeleton({ frames: [{ role: 'ХООК', lines: [{ text: 'еден два три' }], editing: 'cut' }] });
    expect(sk).toBe('ХООК — 1 реплика (~3 збора) [монтажа]');
  });
  it('is empty for no frames', () => {
    expect(scriptSkeleton({ frames: [] })).toBe('');
    expect(scriptSkeleton(null)).toBe('');
  });
});

describe('buildCreativeDirectorPrompt', () => {
  it('includes client, doubled concept count, product and exact-id instruction', () => {
    const p = buildCreativeDirectorPrompt(cdBase);
    expect(p).toContain('Клиент: Алекс (јазик MK)');
    expect(p).toContain('генерирај 6 концепти'); // requested * 2
    expect(p).toContain('Продукт во фокус: Роденденски попусти');
    expect(p).toContain('- av1 · Марија — болка: нема време; сака: брзо решение');
    expect(p).toContain('ЗАБРАНЕТИ фрази (не користи): најдобри на пазарот');
    expect(p).toContain('ГЛАС (насока за ДУХ');
    expect(p).toContain('ПРОВЕРЕНИ ХУКОВИ');
    expect(p).toContain('ИНСАЈТИ (што пали');
    expect(p).toContain('НЕ ПРАВИ ВАКА (DO_NOT_COPY)');
    expect(p.endsWith('Користи ги ТОЧНИТЕ id вредности за avatarId/actorId/locationId.')).toBe(true);
  });

  it('puts the scriptwriter brief FIRST, above the client line (F1)', () => {
    const p = buildCreativeDirectorPrompt({ ...cdBase, brief: 'сезонска акција, потоплен тон' });
    expect(p.startsWith('БРИФ ОД СЦЕНАРИСТОТ — НАЈВАЖНАТА НАСОКА')).toBe(true);
    expect(p).toContain('сезонска акција, потоплен тон');
    expect(p.indexOf('БРИФ ОД СЦЕНАРИСТОТ')).toBeLessThan(p.indexOf('Клиент: Алекс'));
  });

  it('omits the brief block when brief is empty/whitespace', () => {
    expect(buildCreativeDirectorPrompt({ ...cdBase, brief: '   ' })).not.toContain('БРИФ ОД СЦЕНАРИСТОТ');
    expect(buildCreativeDirectorPrompt(cdBase)).not.toContain('БРИФ ОД СЦЕНАРИСТОТ');
  });

  it('omits optional blocks and shows — when product/voice/hooks are empty', () => {
    const p = buildCreativeDirectorPrompt({ ...cdBase, product: undefined, voiceCard: '', hooks: [], insights: [], doNotCopy: [] });
    expect(p).toContain('Продукт во фокус: —');
    expect(p).not.toContain('ГЛАС (насока за ДУХ');
    expect(p).not.toContain('ПРОВЕРЕНИ ХУКОВИ');
    expect(p).not.toContain('ИНСАЈТИ');
    expect(p).not.toContain('DO_NOT_COPY');
  });
});

describe('buildWriterPrompt', () => {
  it('new script: language, rich-field ask, hook, avatar, catalog, actor limits', () => {
    const p = buildWriterPrompt(writerBase);
    expect(p).toContain('Напиши цело реел-сценарио на јазик MK');
    expect(p).toContain('3 ХУК-ВАРИЈАНТИ');
    expect(p).toContain('Концепт (hook): „Ти се случило ова?“');
    expect(p).toContain('Купувач (аватар „Марија“) — пиши за НЕГО: болка: нема време');
    expect(p).toContain('КАТАЛОГ (суштина за СУПСТАНЦА');
    expect(p).toContain('Актер: Стефан — стил: смирен — НЕ МОЖЕ: пее');
    expect(p).toContain('ГЛАС (задржи го ДУХОТ');
    expect(p).toContain('Форма 1:');
    expect(p.endsWith('Врати го во бараниот JSON облик.')).toBe(true);
  });

  it('puts the scriptwriter brief FIRST on a fresh script (F1)', () => {
    const p = buildWriterPrompt({ ...writerBase, brief: 'сезонска акција, потоплен тон' });
    expect(p.startsWith('БРИФ ОД СЦЕНАРИСТОТ — НАЈВАЖНАТА НАСОКА')).toBe(true);
    expect(p).toContain('сезонска акција, потоплен тон');
    expect(p.indexOf('БРИФ ОД СЦЕНАРИСТОТ')).toBeLessThan(p.indexOf('Напиши цело реел-сценарио'));
  });

  it('revision: short prompt referencing only the comment (no brief re-injected — session carries it)', () => {
    const p = buildWriterPrompt({ ...writerBase, brief: 'сезонска акција', revision: true, comment: 'скрати го хукот' });
    expect(p).toBe('Ревидирај го сценариото според коментарот: „скрати го хукот“. Задржи го форматот §11.');
    expect(p).not.toContain('БРИФ ОД СЦЕНАРИСТОТ');
  });

  it('omits avatar/catalog/tone/skeleton blocks when absent', () => {
    const p = buildWriterPrompt({ ...writerBase, avatar: null, catalog: [], voiceCard: '', skeletons: [], actorStyle: null, actorCannotDo: [] });
    expect(p).not.toContain('Купувач (аватар');
    expect(p).not.toContain('КАТАЛОГ');
    expect(p).not.toContain('ГЛАС (задржи');
    expect(p).not.toContain('Форма 1:');
    expect(p).toContain('Актер: Стефан\n'); // no style/cannotDo suffix
  });
});

describe('buildCriticPrompt', () => {
  it('includes criteria intro, glossary, catalog, originality rule and the script markdown', () => {
    const p = buildCriticPrompt({
      language: 'MK',
      preferred: ['Брзо'],
      banned: ['најдобри на пазарот'],
      catalog: ['Пакет А'],
      markdown: '# СЦЕНАРИО\nХООК: ...',
    });
    expect(p).toContain('Оцени го сценариото по 11-те критериуми (1–5)');
    expect(p).toContain('Јазик: MK');
    expect(p).toContain('ЗАБРАНЕТИ фрази (сценариото НЕ смее да ги содржи): најдобри на пазарот');
    expect(p).toContain('• Пакет А');
    expect(p).toContain('антиГенеричност');
    expect(p).toContain('# СЦЕНАРИО');
    expect(p.endsWith('Врати ги оценките и наодите во бараниот JSON облик.')).toBe(true);
  });

  it('shows — for empty catalog', () => {
    const p = buildCriticPrompt({ language: 'MK', preferred: [], banned: [], catalog: [], markdown: 'x' });
    expect(p).toContain('цена е по сет):\n—');
  });
});
