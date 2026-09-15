// Pure prompt builders for the generation agents (Creative Director, Writer,
// Critic). No Prisma, no Fastify — the worker loads the data, then calls these,
// so prompt CONTENT is unit-testable in isolation. Extracted from setFlow.ts
// with ZERO behaviour change; upcoming work (rich context F1–F6) edits only
// these builders + their tests.
//
// Design note: the scriptwriter's BRIEF is meant to be the top-priority input —
// the builders keep a clearly marked slot at the very top of the context so it
// can be injected there (F1) without reshuffling the rest.

// One-line buyer summary from an avatar profile — grounds concepts/scripts in
// the buyer (pain/desire/speech) instead of the old scripts.
export function avatarBrief(a: { profile?: unknown }): string {
  const p = (a.profile ?? {}) as { pain?: string; desire?: string; whyBuy?: string; speech?: string };
  return [
    p.pain && `болка: ${p.pain}`,
    p.desire && `сака: ${p.desire}`,
    p.whyBuy && `купува зашто: ${p.whyBuy}`,
    p.speech && `говор: ${p.speech}`,
  ]
    .filter(Boolean)
    .join('; ');
}

interface SkeletonFrame {
  role?: string;
  editing?: string;
  subLabel?: string;
  table?: unknown;
  lines?: { text?: string }[];
}

// A structural SKELETON of a star script: the beat map (role, how many lines,
// roughly how many words, structural features) with ZERO real sentences. This
// teaches the client's reel rhythm without leaking any text to copy.
export function scriptSkeleton(content: unknown): string {
  const frames = ((content as { frames?: SkeletonFrame[] } | null)?.frames ?? []) as SkeletonFrame[];
  const lines = frames.map((f) => {
    const ls = f.lines ?? [];
    const words = ls.reduce((n, l) => n + String(l.text ?? '').trim().split(/\s+/).filter(Boolean).length, 0);
    const extras = [f.editing ? 'монтажа' : null, f.table ? 'табела-цени' : null, f.subLabel ? 'текст-на-екран' : null].filter(Boolean).join(', ');
    return `${f.role} — ${ls.length} реплик${ls.length === 1 ? 'а' : 'и'} (~${words} збора)${extras ? ` [${extras}]` : ''}`;
  });
  return lines.join('\n');
}

// ── Creative Director ────────────────────────────────────────────────────
export interface CreativeDirectorInput {
  clientName: string;
  language: string;
  requested: number;
  product?: string;
  avatars: { id: string; name: string; profile?: unknown }[];
  actors: { id: string; name: string; languages: string[] }[];
  locations: { id: string; name: string }[];
  preferred: string[];
  banned: string[];
  voiceCard: string;
  hooks: { text: string; direction: string }[];
  insights: { text: string }[];
  doNotCopy: string[];
}

export function buildCreativeDirectorPrompt(i: CreativeDirectorInput): string {
  const toneBlock = i.voiceCard ? `\n\nГЛАС (насока за ДУХ — не реченици за копирање):\n${i.voiceCard}` : '';
  const hooksBlock = i.hooks.length
    ? `\n\nПРОВЕРЕНИ ХУКОВИ (само инспирација за стил — НЕ копирај и НЕ парафразирај; секој концепт со свеж агол):\n${i.hooks.map((h) => `• ${h.text || h.direction}`).join('\n')}`
    : '';
  const insightBlock = i.insights.length
    ? `\n\nИНСАЈТИ (што пали — искористи ги):\n${i.insights.map((n) => `• ${n.text}`).join('\n')}`
    : '';
  const dncBlock = i.doNotCopy.length ? `\n\nНЕ ПРАВИ ВАКА (DO_NOT_COPY):\n${i.doNotCopy.map((s) => `• ${s}`).join('\n')}` : '';
  // F1 will inject the scriptwriter BRIEF here, at the very top (highest priority).
  const ctx = `Клиент: ${i.clientName} (јазик ${i.language}). Барани сценарија: ${i.requested} (генерирај ${i.requested * 2} концепти).\nПродукт во фокус: ${i.product ?? '—'}\nАватари (користи го ТОЧНИОТ id):\n${i.avatars.map((a) => `- ${a.id} · ${a.name}${avatarBrief(a) ? ` — ${avatarBrief(a)}` : ''}`).join('\n')}\nАктери (id·име·јазици): ${i.actors.map((a) => `${a.id}·${a.name}·${a.languages.join('/')}`).join(', ')}\nЛокации (id·име): ${i.locations.map((l) => `${l.id}·${l.name}`).join(', ')}\nРечник (имиња на продукти точно; други термини природно, без набивање): ${i.preferred.join('; ') || '—'}\nЗАБРАНЕТИ фрази (не користи): ${i.banned.join('; ') || '—'}${toneBlock}${hooksBlock}${insightBlock}${dncBlock}`;
  return `${ctx}\nСЕКОЈ концепт со РАЗЛИЧЕН агол и свеж хук — не повторувај ги истите потписни фрази од сет до сет.\nВрати ги концептите во бараниот JSON облик. Користи ги ТОЧНИТЕ id вредности за avatarId/actorId/locationId.`;
}

// ── Writer ───────────────────────────────────────────────────────────────
export interface WriterInput {
  language: string;
  revision?: boolean;
  comment?: string;
  hook: string;
  avatar?: { name?: string; profile?: unknown } | null;
  product?: string;
  catalog: string[];
  actorName: string;
  actorStyle?: string | null;
  actorCannotDo?: string[];
  preferred: string[];
  banned: string[];
  voiceCard: string;
  skeletons: string[];
}

export function buildWriterPrompt(i: WriterInput): string {
  const avatarBlock = i.avatar && avatarBrief(i.avatar) ? `\nКупувач (аватар „${i.avatar.name}“) — пиши за НЕГО: ${avatarBrief(i.avatar)}` : '';
  const catalogBlock = i.catalog.length
    ? `\nКАТАЛОГ (суштина за СУПСТАНЦА на сценариото; цената е по сет, не од тука; не измислувај факти):\n${i.catalog.map((c) => `• ${c}`).join('\n')}`
    : '';
  const toneBlock = i.voiceCard
    ? `\nГЛАС (задржи го ДУХОТ; потписните фрази во наводници се потпис — најмногу ЕДНАШ, не во секое сценарио):\n${i.voiceCard}`
    : '';
  const exampleBlock = i.skeletons.length
    ? `\nТИПИЧНИ ФОРМИ НА КЛИЕНТОТ (само ритам/должини на бит-ови — БЕЗ текст; варирај во рамки, не следи ропски):\n${i.skeletons.map((sk, n) => `Форма ${n + 1}:\n${sk}`).join('\n\n')}`
    : '';
  // F1 will inject the scriptwriter BRIEF here, at the very top (highest priority).
  return i.revision
    ? `Ревидирај го сценариото според коментарот: „${i.comment ?? ''}“. Задржи го форматот §11.`
    : `Напиши цело реел-сценарио на јазик ${i.language} во стандардниот формат (кадри со улога ХООК/БОДИ/ЦТА, режија одвоена од реплика, реплика со име на актер).\nДодај и: 3 ХУК-ВАРИЈАНТИ (различни отворачки за истиот концепт), 3 CAPTION варијанти (текст за објавата), продукциска забелешка (како да се снима — тон, кадри, што да се потврди пред снимање), формат (пр. „Presenter + demo“), вајб, музика, платформи, времетраење во секунди.\nКонцепт (hook): „${i.hook}“${avatarBlock}\nПродукт во фокус: ${i.product ?? '—'}${catalogBlock}\nАктер: ${i.actorName}${i.actorStyle ? ` — стил: ${i.actorStyle}` : ''}${i.actorCannotDo?.length ? ` — НЕ МОЖЕ: ${i.actorCannotDo.join(', ')}` : ''}\nРечник (користи природно, не набивај): ${i.preferred.join('; ') || '—'}\nЗАБРАНЕТИ фрази (не користи): ${i.banned.join('; ') || '—'}${toneBlock}${exampleBlock}\nВАЖНО: пиши СВЕЖИ, разговорни реплики — не рециклирај реченици/слогани од постоечки видеа, веб-текст или профилот, не врти ги истите фрази. Природно, како што зборува човек, не како реклама-клише.\nВрати го во бараниот JSON облик.`;
}

// ── Critic ───────────────────────────────────────────────────────────────
export interface CriticInput {
  language: string;
  preferred: string[];
  banned: string[];
  catalog: string[];
  markdown: string;
}

export function buildCriticPrompt(i: CriticInput): string {
  return `Оцени го сценариото по 11-те критериуми (1–5) и дај наоди со референца на кадар. Јазик: ${i.language}.\nПретпочитани термини/имиња на продукти: ${i.preferred.join('; ') || '—'}\nЗАБРАНЕТИ фрази (сценариото НЕ смее да ги содржи): ${i.banned.join('; ') || '—'}\nКАТАЛОГ (за критериумот „точност" — фактите мора да се совпаѓаат; цена е по сет):\n${i.catalog.map((c) => `• ${c}`).join('\n') || '—'}\nОРИГИНАЛНОСТ (во критериумот „антиГенеричност"): КАЗНИ рециклирани/клише реплики, реклама-калап и повторени потписни слогани; НАГРАДИ свежи, разговорни, човечки реченици. Ако звучи препишано од веб/стари видеа — ниска оценка + конкретен наод.\nСценарио (markdown):\n${i.markdown}\nВрати ги оценките и наодите во бараниот JSON облик.`;
}
