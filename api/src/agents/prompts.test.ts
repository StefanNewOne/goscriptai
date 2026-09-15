import { describe, it, expect } from 'vitest';
import {
  avatarBrief,
  scriptSkeleton,
  marketFraming,
  scriptTypeGuide,
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

describe('marketFraming (F2)', () => {
  it('MK → Macedonian viewer, SQ → Albanian viewer, BOTH → both', () => {
    expect(marketFraming('MK')).toContain('МАКЕДОНСКИ гледач');
    expect(marketFraming('SQ')).toContain('АЛБАНСКИ гледач');
    const both = marketFraming('BOTH');
    expect(both).toContain('МАКЕДОНСКИ');
    expect(both).toContain('АЛБАНСКИ');
  });
  it('always warns against translated adspeak', () => {
    expect(marketFraming('MK')).toContain('Избегнувај калкиран рекламен англиски тон');
  });
});

describe('buildCreativeDirectorPrompt', () => {
  it('injects local-audience framing for the client language (F2)', () => {
    expect(buildCreativeDirectorPrompt(cdBase)).toContain('АУДИТОРИУМ — пишуваш за МАКЕДОНСКИ гледач');
    expect(buildCreativeDirectorPrompt({ ...cdBase, language: 'SQ' })).toContain('АЛБАНСКИ гледач');
  });

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

describe('scriptTypeGuide (F4)', () => {
  it('describes each known type, empty for unknown', () => {
    expect(scriptTypeGuide('PRODUCT_OFFER')).toContain('Продукт/понуда');
    expect(scriptTypeGuide('EDUCATIONAL')).toContain('Едукативно');
    expect(scriptTypeGuide('TESTIMONIAL')).toContain('Тестимонијал');
    expect(scriptTypeGuide('SKETCH')).toContain('Скеч');
    expect(scriptTypeGuide('WHATEVER')).toBe('');
  });
});

describe('buildWriterPrompt', () => {
  it('injects local-audience framing on a fresh script (F2)', () => {
    expect(buildWriterPrompt(writerBase)).toContain('АУДИТОРИУМ — пишуваш за МАКЕДОНСКИ гледач');
    expect(buildWriterPrompt({ ...writerBase, revision: true, comment: 'x' })).not.toContain('АУДИТОРИУМ');
  });

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

  it('includes the concept reasoning (insight + why) and script type (F3+F4)', () => {
    const p = buildWriterPrompt({ ...writerBase, insight: 'се препознаваат во проблемот', why: 'кратко и конкретно', scriptType: 'PRODUCT_OFFER' });
    expect(p).toContain('Тип на сценарио: Продукт/понуда —');
    expect(p).toContain('Инсајт (зошто гледачот застанува): се препознаваат во проблемот');
    expect(p).toContain('Зошто овој концепт работи: кратко и конкретно');
  });

  it('omits type/insight/why when absent (F3+F4)', () => {
    const p = buildWriterPrompt(writerBase);
    expect(p).not.toContain('Тип на сценарио:');
    expect(p).not.toContain('Инсајт (зошто гледачот застанува)');
    expect(p).not.toContain('Зошто овој концепт работи');
  });

  it('includes the location with usable elements and constraints (F5)', () => {
    const p = buildWriterPrompt({
      ...writerBase,
      location: { name: 'Салон', description: 'светло студио', usableElements: ['огледало', 'столче'], constraints: 'без гласна музика' },
    });
    expect(p).toContain('Локација: Салон — светло студио');
    expect(p).toContain('Искористи од локацијата: огледало, столче');
    expect(p).toContain('Ограничувања на локацијата: без гласна музика');
  });

  it('omits the location block when absent (F5)', () => {
    expect(buildWriterPrompt({ ...writerBase, location: null })).not.toContain('Локација:');
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
    expect(p).toContain('АУДИТОРИУМ — пишуваш за МАКЕДОНСКИ гледач'); // F2
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

  it('judges against intent: brief, avatar and concept (F6)', () => {
    const p = buildCriticPrompt({
      language: 'MK',
      preferred: [],
      banned: [],
      catalog: [],
      markdown: 'x',
      brief: 'сезонска акција',
      avatar: { name: 'Марија', profile: { pain: 'нема време' } },
      conceptHook: 'Ти се случило ова?',
      conceptInsight: 'се препознаваат',
    });
    expect(p).toContain('БРИФ (намерата за овој сет');
    expect(p).toContain('сезонска акција');
    expect(p).toContain('АВАТАР (за критериумот „аватар“');
    expect(p).toContain('болка: нема време');
    expect(p).toContain('КОНЦЕПТ: hook „Ти се случило ова?“ · инсајт: се препознаваат');
  });

  it('omits intent blocks when brief/avatar/concept absent (F6)', () => {
    const p = buildCriticPrompt({ language: 'MK', preferred: [], banned: [], catalog: [], markdown: 'x' });
    expect(p).not.toContain('БРИФ (намерата');
    expect(p).not.toContain('АВАТАР (за критериумот');
    expect(p).not.toContain('КОНЦЕПТ: hook');
  });
});
