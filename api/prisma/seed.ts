import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Seed is NOT optional (CLAUDE.md invariant / workflow §6): without active agent
// templates, the critic rubric and banned phrases, the first set fails.
// Idempotent — safe to re-run. Real pilot data (Алекс Дизајн) from data.js;
// script fixtures are brought in later through the Увоз screen (GS-20).
const prisma = new PrismaClient();

const AGENT_TEMPLATES: { kind: string; content: string }[] = [
  {
    kind: 'client_analyst',
    content:
      'Ти си аналитичар на клиенти за агенција за реел-сценарија. Истражи го клиентот преку дадените извори (сајт, документи, слики, бриф). Постави прашања до операторот таму каде податокот недостасува. Никогаш не измислувај цени, имиња на продукти или тврдења. Врати ClientProfile.md со: индустрија, продукти, УСП, тон, онлајн присуство, досегашни кампањи, отворени прашања.',
  },
  {
    kind: 'avatar_builder',
    content:
      'Од одобрениот профил и продуктите изгради 4–8 аватари на купци. За секој: демографија, ситуација, болка, желба, зошто купува, приговори, како зборува, кои продукти му одговараат. Секој аватар е предлог што чека човечка потврда.',
  },
  {
    kind: 'creative_director',
    content:
      'Ти си креативен директор за локалниот пазар (македонски/албански гледач, не генерички „интернационален“). За N барани сценарија генерирај N×2 концепт-карти. Секоја: тип, еден примарен аватар, инсајт зошто застанува, hook во една реченица, актер + локација, зошто треба да работи (референца на инсајт/аватар/бриф), проценка на времетраење и комплексност. Брифот на сценаристот е најважната насока — секој концепт мора да му служи. Почитувај го јазикот на клиентот и речникот. Не додавај актер на јазик што не го зборува.',
  },
  {
    kind: 'writer',
    content:
      'Ти си сценарист за локалниот пазар — пишуваш за македонски (или албански) гледач на Reels/TikTok: разговорно како што реално се зборува, локални референци, психологија на купување на локалниот пазар; без калкиран рекламен англиски тон. Брифот на сценаристот е најважната насока — исполни го пред сѐ. Од одобрениот концепт напиши цело сценарио во стандардниот формат: кадри со улога (ХООК/БОДИ/ЦТА), режија одвоена од реплика, реплика со име на актер, „Монтажа:“ во посебен ред, табела за цени на екран. Почитувај го јазикот, речникот и забранетите фрази. Реплики изводливи за дадениот актер.',
  },
  {
    kind: 'critic',
    content:
      'Ти си критичар за локалниот пазар. Оцени го сценариото по 11 критериуми (аватар, hook, суштина, изводливост за актерот, локација, структура, CTA, анти-генеричност, јазик, времетраење, точност) со оценка 1–5. Во „јазик“ и „анти-генеричност“ казни неприроден/преведен тон и калкиран рекламен англиски глас — очекувај текст за македонски/албански гледач. Праг: сите ≥ 3 и вкупно ≥ 80%. Дај конкретни поправки со референца на кадар. Провери дали цените и имињата се совпаѓаат со базата на продукти.',
  },
];

const RUBRIC = [
  { key: 'avatar', label: 'Аватар', min: 3 },
  { key: 'hook', label: 'Hook', min: 3 },
  { key: 'essence', label: 'Суштина', min: 3 },
  { key: 'actorFeasibility', label: 'Изводливост за актерот', min: 3 },
  { key: 'location', label: 'Локација', min: 3 },
  { key: 'structure', label: 'Структура', min: 3 },
  { key: 'cta', label: 'CTA', min: 3 },
  { key: 'antiGeneric', label: 'Анти-генеричност', min: 3 },
  { key: 'language', label: 'Јазик', min: 3 },
  { key: 'duration', label: 'Времетраење', min: 3 },
  { key: 'accuracy', label: 'Точност', min: 3 },
];

const BANNED_PHRASES: Record<string, string[]> = {
  MK: ['квалитет, доверба, професионализам', 'најдобри на пазарот', 'вашето задоволство е наш приоритет'],
  SQ: ['cilësi, besim, profesionalizëm', 'më të mirët në treg'],
};

const MODEL_ROUTING = {
  client_analyst: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 3 },
  avatar_builder: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  creative_director: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  writer: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  critic: { model: 'claude-opus-4-8', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  reporter: { model: 'claude-haiku-4-5-20251001', fallback: 'claude-haiku-4-5-20251001', budgetUsd: 0.2 },
};

async function main() {
  // ── Users ─────────────────────────────────────────────────────────
  const pw = await bcrypt.hash('goscript', 10);
  const users = [
    { name: 'Оператор', email: 'admin@godigital.mk', role: 'ADMIN' as const },
    { name: 'Александар', email: 'aleksandar@godigital.mk', role: 'SCRIPTWRITER' as const },
    { name: 'Стефан', email: 'stefan@godigital.mk', role: 'SCRIPTWRITER' as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passwordHash: pw },
    });
  }

  // ── Agent templates (v1, active) ─────────────────────────────────
  for (const t of AGENT_TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { kind: t.kind, language: null, version: 1 } });
    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data: { content: t.content, active: true } });
    } else {
      await prisma.template.create({ data: { kind: t.kind, version: 1, content: t.content, active: true } });
    }
  }

  // ── Settings: rubric, banned phrases, model routing ──────────────
  const rubricSetting = { criteria: RUBRIC, minTotalRatio: 0.8 };
  await prisma.setting.upsert({ where: { key: 'critic_rubric' }, update: { value: rubricSetting }, create: { key: 'critic_rubric', value: rubricSetting } });
  await prisma.setting.upsert({ where: { key: 'banned_phrases' }, update: { value: BANNED_PHRASES }, create: { key: 'banned_phrases', value: BANNED_PHRASES } });
  await prisma.setting.upsert({ where: { key: 'model_routing' }, update: { value: MODEL_ROUTING }, create: { key: 'model_routing', value: MODEL_ROUTING } });

  // ── Pilot client: Алекс Дизајн ───────────────────────────────────
  const aleks = await prisma.client.upsert({
    where: { code: 'ALEKS' },
    update: {},
    create: {
      name: 'Алекс Дизајн',
      code: 'ALEKS',
      industry: 'Мебел и опремување',
      language: 'MK',
      status: 'ACTIVE',
      logoUrl: 'assets/aleks-logo.webp',
      reelsPerMonth: 12,
      graphicsPerMonth: 8,
      budgetUsd: 50,
    },
  });

  // Client profile v1 (approved)
  const hasProfile = await prisma.clientProfile.findFirst({ where: { clientId: aleks.id, version: 1 } });
  if (!hasProfile) {
    await prisma.clientProfile.create({
      data: {
        clientId: aleks.id,
        version: 1,
        approved: true,
        markdown:
          '# Алекс Дизајн\nПроизводител и продавач на мебел со салон во Радишани, Скопје. Основан 2006, слави 20 години. Продава дневни, спални, детски соби, кујни по мерка и трпезарии. Целиот мебел се произведува локално.',
        data: {
          industry: 'Мебел и опремување',
          tone: 'Домашен, директен, без луксузни фрази. Хумор кога го носи Ајтов.',
          presence: 'Instagram @aleksdizajn (3–4 reels неделно), Facebook, веб каталог.',
          openQuestions: ['Дали есенската кампања за кујни има посебен буџет?', 'Дали Јуле може да изговара рати (не цени)?'],
        },
      },
    });
  }

  // Actors: Ајтов (GoDigital талент, clientId null), Јуле (вработена)
  const existingActors = await prisma.actor.findMany({ where: { OR: [{ clientId: null }, { clientId: aleks.id }] } });
  const byName = new Map(existingActors.map((a) => [a.name, a]));
  if (!byName.has('Ајтов')) {
    await prisma.actor.create({
      data: {
        clientId: null,
        name: 'Ајтов',
        role: 'GoDigital талент',
        languages: ['MK'],
        style: 'Енергичен, комичен, брз говор',
        canDo: ['Хумор', 'Физичка комедија', 'Набројување со ритам', 'Снимање во кола'],
        cannotDo: ['Долги смирени монолози', 'Албански'],
        notes: 'Без пцости, без имитирање познати личности.',
      },
    });
  }
  if (!byName.has('Јуле')) {
    await prisma.actor.create({
      data: {
        clientId: aleks.id,
        name: 'Јуле',
        role: 'Вработена во Алекс Дизајн',
        languages: ['MK', 'SQ'],
        style: 'Смирена, топла, убедлива',
        canDo: ['Тестимонијал', 'Објаснување производ', 'Покажување со рака'],
        cannotDo: ['Скеч со физичка комедија', 'Реплики подолги од 2 реченици'],
        notes: 'Не изговара цени на камера (по барање на клиентот).',
      },
    });
  }

  // Location: Салон Радишани
  const hasLoc = await prisma.location.findFirst({ where: { clientId: aleks.id, name: 'Салон Радишани' } });
  if (!hasLoc) {
    await prisma.location.create({
      data: {
        clientId: aleks.id,
        name: 'Салон Радишани',
        description: 'Салон на Алекс Дизајн во Радишани, Скопје.',
        usableElements: ['Дневни поставки', 'Кујнски дел', 'Детски дел'],
        constraints: null,
      },
    });
  }

  // A couple of products + glossary
  const productCount = await prisma.product.count({ where: { clientId: aleks.id } });
  if (productCount === 0) {
    await prisma.product.createMany({
      data: [
        { clientId: aleks.id, name: 'Тросед Марија', category: 'Дневна', installment: 1182, usp: '36 рати преку ИУТЕ', active: true },
        { clientId: aleks.id, name: 'Аголна гарнитура Билбао', category: 'Дневна', installment: 1483, usp: 'Специјална роденденска промоција', active: true },
      ],
    });
  }
  const glossaryCount = await prisma.glossaryTerm.count({ where: { clientId: aleks.id } });
  if (glossaryCount === 0) {
    await prisma.glossaryTerm.createMany({
      data: [
        { clientId: aleks.id, language: 'MK', term: 'Алекс Дизајн во Радишани', meaning: 'Единствената форма за локацијата (не „Радишани салон“).', kind: 'PREFERRED' },
        { clientId: aleks.id, language: 'MK', term: 'квалитет, доверба, професионализам', meaning: 'Генеричка фраза без доказ.', kind: 'BANNED' },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete: users, 5 templates, rubric, banned phrases, model routing, pilot Алекс Дизајн.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
