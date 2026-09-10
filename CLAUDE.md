# CLAUDE.md — GoScriptAI

Овој фајл го чита Claude Code на **секоја** сесија. Строго почитувај сè подолу — тоа е столбот на проектот.

**Референтни документи (извор на вистина, по приоритет):**
1. `GoScriptAI_PRD_v1_0.md` — PRD v1.0: зошто системот постои, агенти, state machines, модел на податоци, фази. **Извор на вистина за функционалност.**
2. `design_handoff_goscriptai/Техничка документација.dc.html` — per-екран технички спец: рути, API, модели, транзиции, edge-cases, критериуми за прифаќање (отвори во browser; не бара сервер).
3. `GoScriptAI_Design_Brief_v1_0.md` + `design_handoff_goscriptai/README.md` — визуелна насока и **конкретни дизајн токени** (hex), 14 екрани, забрани. **Извор за изглед и однесување.**
4. `design_handoff_goscriptai/GoScriptAI.dc.html` — интерактивен прототип (сите екрани, состојби, текови). **Референца за поведение** — кликни низ него пред UI работа. Прототипот е една компонента со мокирани податоци и `setTimeout` тајминзи; во продукција секоја агентска фаза е BullMQ job со SSE статус.
5. `design_handoff_goscriptai/data.js` — фикстур податоци (вистински материјал на агенцијата — „Алекс Дизајн Август Сценарија“). Задржи го текстот verbatim при seed.
6. `design_handoff_goscriptai/Упатство за сценарист.dc.html` — упатство за краен корисник, екран по екран.

**При конфликт: PRD за функција → Design Brief за изглед → README/Техничка документација за конкретни вредности → прототипот за поведение.** Ако прототипот противречи на PRD, **PRD победува** и прототипот е грешка. За неодредено — **застани и прашај.** Не измислувај однесување што не е во спецификацијата.

**Однос со GoFactory / GoDigital OS / GraficarAI:** самостоен систем, иста архитектурна филозофија и стек, **посебна база, посебен deploy, без заеднички код** освен по договор на Tech Lead.

---

## Проект

GoScriptAI е внатрешен систем кој за секој клиент гради **„Мозок на клиентот“** (кој е клиентот, што продава, кому, што прави конкуренцијата, што работи во платените реклами) и врз тој мозок му помага на сценаристот да произведе сетови реел-сценарија со аватар купец, суштина и мерливи резултати — со **задолжителни човечки чекпоинти** на секоја клучна одлука.

Два принципа кои го дефинираат целиот систем:
- **АИ ја носи меморијата и механиката, сценаристот ја носи одлуката.** Сценаристот знае сè за клиентот во секој момент, но чита само **делта**, а не сè одново.
- **Системот учи од резултати.** Секое сценарио е поврзано со реклама во Meta Ads Manager; резултатот се враќа во системот и го менува следното сценарио.

Корисници: два сценаристи/режисери (Александар, Стефан), ~20 сета месечно секој, паралелно на повеќе клиенти. Долги сесии на читање на бирото + брзо одобрување од телефон на терен.

**Опфат на овој код (Фаза 0 + Фаза 1):**
- **Ф0 — Податоци:** увоз на постоечки сценарија (docx/paste/multi-file), доделување код = име на реклама, рачен Client Brain за 3 пилот клиенти.
- **Ф1 — MVP:** клиенти + intake; Client Brain агенти (Client Analyst, Avatar Builder) + рачни ентитети; Сет flow (Бриф → Creative Director → чекпоинт → Writers паралелно → Critic → чекпоинт → одобрување/ревизија → експорт docx); dashboard, Inbox „Чека тебе“, „Што е ново“, cost tracking, нотификации.
- **Фаза 2 (jamka на учење)** и **Фаза 3 (стратег, Whisper)** — статусите и моделот **постојат** во схемата, но агентите **не се извршуваат** (сиви во UI). Ознаката **(Ф2)/(Ф3)** значи „подготви модел, не гради runtime“.

## Stack (НЕ менувај без експлицитна одлука)

- **Backend:** Node.js 22 + TypeScript (strict) + **Fastify** (НЕ Express)
- **База:** PostgreSQL 16 + Prisma ORM + **pgvector** (семантичко пребарување на сценарија и референци). Посебна инстанца од GoFactory.
- **Job queue:** BullMQ + Redis — сите агентски run-ови се job-ови, **никогаш синхроно со HTTP** (сесиите траат минути).
- **АИ:** `@anthropic-ai/claude-agent-sdk`; автентикација преку **Claude Max претплата** (Claude Code CLI login на серверот, PRD §6) со **автоматски fallback на `ANTHROPIC_API_KEY`** ако Max падне/лимитира + нотификација. SDK-то го допира само `agents/sdk.ts`. Модел-рутирање по агент од Поставки.
- **Frontend:** React + Vite + TailwindCSS (SPA), **македонска кирилица**, TanStack Query за server state. Mobile-first за чекпоинти.
- **Реал-тајм:** SSE преку Redis pub/sub (не polling, не директно од worker — инаку не работи со повеќе инстанци).
- **Документи:** генерирање `.docx` (стандарден темплејт §11 од PRD) + markdown.
- **Инфра:** Docker Compose (Postgres 16 + pgvector, Redis 7, Nginx), Hetzner VPS. Посебен сервер/контејнери од GoFactory.
- **Нотификации:** Amazon SES (email) + Telegram Bot API.
- **Meta (Ф2):** Marketing API + Ad Library преку постоечкиот long-lived token. **Whisper (Ф3):** API.
- **Клучна NFR:** сценаристот **никогаш не чека на екран за агент** — сè оди преку queue со live статус (SSE) и Inbox.

## Структура на репо (monorepo — npm workspaces: `api`, `web`)

```
goscriptai/
├── package.json          # npm workspaces: api, web
├── CLAUDE.md             # стандардот што важи и за ОВОЈ репо
├── ImplementationPlan.md · Backlog.md
├── README.md · .env.example · docker-compose.yml
├── api/
│  ├── prisma/            # schema.prisma · migrations/ · seed.ts (дел од deploy)
│  └── src/
│     ├── server.ts       # Fastify bootstrap · плагини · graceful shutdown
│     ├── env.ts          # Zod валидација на околината — ПАЃА при недостаток
│     ├── routes/         # само HTTP: валидира → повика сервис → врати
│     ├── domain/         # ← срцето. НЕМА Fastify, НЕМА Prisma import
│     │  ├── clientMachine.ts   # транзиции на Client onboarding
│     │  ├── setMachine.ts       # транзиции на Set flow
│     │  ├── checkpoints.ts      # човечките чекпоинти и што бараат
│     │  ├── critic.ts           # рубрика + праг (сите ≥3 и вкупно ≥80%)
│     │  ├── budget.ts           # 80% · 100% · BUDGET_HOLD правила
│     │  ├── scriptFormat.ts     # нормализација во стандардниот формат §11
│     │  └── code.ts             # {CLIENT_CODE}-{YYMM}-{NN} генератор
│     ├── agents/         # дефиниции, не транспорт · sdk.ts (session resume)
│     ├── queues/         # index.ts + workers/ (еден фајл по job тип)
│     ├── services/       # оркестрација: домен + база + редови
│     ├── events/         # Redis pub/sub → SSE
│     ├── lib/            # docx.ts · ses.ts · telegram.ts · import-parser.ts
│     └── import/         # docx/markdown/paste парсирање и нормализација
└── web/
   └── src/               # main.tsx · router.tsx · screens/ (14) · components/ · hooks/ · lib/api.ts · i18n/
```

**Конвенција на слоеви (backend):** route (тенок: валидира → повика сервис → врати) → service (оркестрација) → domain (чиста логика) / Prisma. **Нема бизнис логика во routes.**
**Конвенција на слоеви (frontend):** компонента → hook (TanStack Query) → `lib/api.ts`. **Нема бизнис логика во React компоненти.**

## Јазик и текстови

- **Сите UI strings: македонска кирилица.** Технички термини што индустријата ги користи остануваат англиски каде е природно (upload, dashboard, docx). Речник на UI термини (задолжително консистентен): Клиент · Мозок на клиентот · Профил · Аватар · Продукт · Актер · Локација · Конкурент · Референца · Речник · Сет · Бриф · Концепт · Сценарио · Кадар · Критика · Чекпоинт · Инбокс „Чека тебе“ · Што е ново · Резултати · Инсајт · Увоз · Поставки.
- UI strings централизирани во `web/src/i18n/` — **НИКОГАШ hardcoded** литерал во компоненти.
- Код, коментари, имиња на променливи, commit пораки: **англиски**.
- Датуми во UI: `DD.MM.YYYY`, време 24h. **Валута: USD** (буџети и трошоци наспроти Max кредитот и API fallback).
- Кадарски улоги **ХООК / БОДИ / ЦТА** се пишуваат со ГОЛЕМИ букви — конвенција од доменот, единствениот дозволен ALL-CAPS.
- `error.message` од API е на македонски, кажува **што се случило и што да се направи**, без извинување („Max претплатата е лимитирана. Сетот продолжи преку API клуч; трошокот е означен.“).
- Сценарија се пишуваат на **македонски или албански** според `Client.language` — тоа е јазик на **испораката**, различно од јазикот на UI.

---

## ТВРДИ ИНВАРИЈАНТИ — прекршување е bug, не стилска разлика

### 1. Статус се менува само преку state machine
`domain/clientMachine.ts` и `domain/setMachine.ts` се **единствените** места што знаат што после што. Секоја промена на статус минува преку transition функцијата која: валидира по дозволените транзиции, проверува RBAC, проверува guard-и, **пишува лог запис**, креира downstream job-ови/нотификации. Никогаш `prisma.scriptSet.update({ data: { status } })` надвор од овој слој. Ако route има `if` над статус — тоа му е местото во `domain/`. State machine + `domain/` = **100% тест покриеност** (највисок приоритет).

### 2. Ниту еден агент не запишува нов ентитет без човечка потврда
Ниту еден агент (Client Analyst, Avatar Builder, Competitor, Creative Director, Critic…) **не запишува нов ентитет** (аватар, конкурент, профил, референца) како активен во базата. Предлогот стои во `PENDING_CONFIRMATION` додека човек не го потврди на чекпоинт. AI излезите се **предлог** во UI — сценаристот одобрува.

### 3. Ниту еден агентски повик од HTTP route — секогаш BullMQ job
Агентските сесии траат минути и не смеат да ја држат HTTP врската. Секој агентски повик е job во ред; статусот се стрима преку SSE. Retry-то го води **BullMQ, не SDK** → `ANTHROPIC_MAX_RETRIES=0`. Политика: `attempts: 3`, exponential backoff. Rate limit (429) → пауза со тајмер, **не троши attempt**. По 3 потрошени attempt → `FAILED`, потребен **рачен** retry (го нулира бројачот). Паралелни Writer job-ови се независни — пад на еден **не го руши сетот**.

### 4. Ревизијата не убива сесија — `sessionId` е клучот
При „Врати со коментар“ / auto-revision, коментарот влезе во **истата** агентска сесија преку `sessionId` (Agent SDK resume). Контекстот е сочуван, истражувањето **не се плаќа повторно**, и се крева верзијата на документот/сценариото. Ако агентот се убие и се стартува нов, сè се плаќа од нула — затоа **пауза, не kill**.

### 5. Message записи се пишуваат во тек на сесијата, не по завршување
Секоја порака, tool_use и tool_result се снима како `Message` **додека тече** сесијата — ништо не се губи ако падне. `Message` е најбрзо растечката табела (индекс `(runId, createdAt)`).

### 6. CostEntry е автоматски од SDK output
Трошокот се чита од SDK output и се запишува во `CostEntry` (по клиент и по сет и по агент); `Client.spentUsd`/сет буџет се ажурираат. **Рачно внесување трошок не постои.** Буџет по клиент (default $50) и по сет (default $8): на **80%** → предупредување; на **100%** → `BUDGET_HOLD`, сите агентски повици за тој опфат стануваат. Излез: кревање буџет (над потрошеното → враќање на претходен статус) или архивирање.

### 7. Кодот на сценариото == името на рекламата
Секое сценарио добива код `{CLIENT_CODE}-{YYMM}-{NN}` (пр. `ALEKS-2609-03`), **неменлив**, `@unique`. **Овој код е името на рекламата во Ads Manager** — единственото правило за мапирање (Ф2). Генерирањето е во service слојот, атомско (без race при паралелно), при судир нуди следен слободен `NN`. Кодот се прикажува крупно и е копирлив со едно копче.

### 8. Јазик и речник се задолжителен влез за секој агент што пишува текст
Секој агент што пишува текст за клиентот (Creative Director, Writer, Critic) добива **јазик на клиентот** и **речник** (претпочитани/забранети зборови, имиња на продукти) како задолжителен влез. Creative Director не додава актер на концепт на јазик кој актерот не го зборува. Критичарот има јазичен критериум по јазик на сценариото. За `language: BOTH`, двојазично сценарио е две верзии со ист код и суфикс `-MK` / `-SQ`.

### 9. Праг на Критичарот е бариера во кодот
Critic оценува секое сценарио по 11 критериуми (§10 PRD) со оценка 1–5. Праг: **сите критериуми ≥ 3 И вкупно ≥ 80%**. Под праг → CriticReport назад кај Writer во **иста сесија** (max 2 круга); потоа сценариото се прикажува со флаг `CRITIC_FAILED` и наодите (сценаристот сепак може да одобри). Прагот и рубриката се уредливи од Поставки со верзии.

### 10. Транзициите се транскациски и resumable
Ниту еден пад не смее да остави сет во недефинирана состојба. Секоја фаза памети checkpoint во базата; по пад/рестарт системот продолжува од последната завршена фаза, никогаш од нула. Специјални статуси (`PAUSED`, `FAILED`, `BUDGET_HOLD`) го памтат претходниот статус за враќање.

### 11. Секоја mutation остава траг (append-only)
Секоја промена на статус, секое одобрување, секоја нотификација, секоја промена во Brain пишува запис (`Approval` за човечки одлуки, `BrainChange` за „Што е ново“, лог за транзиции). **Никогаш update/delete на трагот — само додавање.** Тоа е основата при спор и при дебагирање.

### 12. Пари како Decimal, времиња UTC
Пари: Prisma `Decimal` (`@db.Decimal(10,2)` за буџет, `(10,4)` за трошок по повик), **никогаш float**. Времиња: UTC во база, `Europe/Skopje` само за прикажување.

### 13. Env валидација паѓа при стартување
`env.ts` со Zod ги валидира сите променливи при boot. **Ниту една вредност нема default во кодот** за задолжителните — системот паѓа при недостаток, и тоа е точното однесување. Секрети (Meta token, API клучеви) само во `.env` на серверот — **никогаш** во промптови, логови или git. Агентите имаат read-only пристап до uploads и Brain документи; пишуваат само во својот сет workspace.

### 14. RBAC е серверски, не UI работа
Три улоги: **Scriptwriter** (свои и туѓи клиенти: гради Brain, отвора сетови, одобрува, доработува, експортира), **Admin/Operator** (сè + Поставки, темплејти, буџети, модел-рутирање, увоз, интеграции), **Viewer** (read-only). `FORBIDDEN` при Viewer обид за дејство **не смее да зависи само од UI** — проверено серверски на секој endpoint.

### 15. Границите на архитектурата не се преминуваат
- `domain/` **не увезува** Fastify ниту Prisma. Чисти функции над обични објекти → тестибилен без база.
- `routes/` **не содржи** бизнис логика.
- Fastify SDK-то се допира само во `agents/sdk.ts`; модел-имиња се читаат од `Template`/Поставки, никогаш hardcoded во сервисен код.

---

## State machines — извор на вистина

**Client onboarding** (`domain/clientMachine.ts`; `*` = човечки чекпоинт):
```
DRAFT → INTAKE → ANALYST_RUNNING → ANALYST_QUESTIONS* → ANALYST_REVIEW*
→ AVATARS_RUNNING → AVATARS_REVIEW* → MANUAL_SETUP* → ACTIVE
```
`MANUAL_SETUP` не блокира — клиентот може да стане `ACTIVE` со минимум еден актер; сè друго се дополнува.

**Set flow** (`domain/setMachine.ts`; `*` = човечки чекпоинт):
```
DRAFT → BRIEF_SUBMITTED → CONCEPTS_GENERATING → CONCEPTS_REVIEW*
→ SCRIPTS_WRITING → CRITIC_RUNNING → (AUTO_REVISION ≤ 2 круга)
→ SCRIPTS_REVIEW* (↔ REVISION со коментар, иста сесија)
→ APPROVED → EXPORTED
→ [Ф2] LINKED_TO_ADS → LEARNED → ARCHIVED
```
Специјални (од секаде): `PAUSED` · `FAILED` (по 3 retry) · `BUDGET_HOLD`.

Дефиницијата е explicit мапа со `to[]`, `guard`, `allowedRoles`, `sideEffects[]` по транзиција. **Ако PRD и код се разликуваат — PRD победува; прашај пред отстапка.**

## Агенти (PRD §7)

| Агент | Слој | Модел (default) | Алатки | Влез → Излез |
|---|---|---|---|---|
| **Client Analyst** | Brain | Fable 5.1 (fallback Opus) | WebFetch, WebSearch, Read | сајт/документи/слики/бриф → прашања + ClientProfile.md |
| **Avatar Builder** | Brain | Fable 5.1 | Read | одобрен профил + продукти → 4–8 Avatar (`PENDING_CONFIRMATION`) |
| **Creative Director** | Set | Fable 5.1 | Read | бриф + Brain + инсајти + „не го прави ова“ → N×2 концепт-карти |
| **Writer** (×N паралелно) | Set | Fable 5.1 (fallback Opus) | Read | одобрен концепт + Brain + примери + речник → цело сценарио |
| **Critic** | Set | Opus | Read | сценарио + рубрика + речник + актер/локација → CriticReport + auto-revision |
| **Reporter** | — | Haiku | — | настани од базата → резимеа за нотификации и „Што е ново“ |
| Competitor / Trend / Ads Performance / Insight Distiller / Strategist | Brain | (Ф2/Ф3) | — | сиви во UI; модел подготвен, runtime не се гради |

Правила за сите агенти:
- Фиксен system prompt чуван како `Template` во базата (уредлив од Поставки, **со верзии**). Сетовите во тек ја држат верзијата со која стартувале.
- Секој run има max буџет (USD) и max траење → `BUDGET_HOLD`/timeout по правилата.
- **Prompt caching задолжително** за документите што се повторуваат (Client Brain — влегуваат во секој сет).
- Целиот транскрипт се снима како `Message` (инваријанта 5).
- Модел-имиња се читаат од `Template`/Поставки. Anthropic — најнов capable модел; провери `claude-api` skill/reference пред да заковаш model id или цени.

## Модел на податоци (Prisma — извор: PRD §15)

Клучни модели (скратено — целосно во PRD §15 и `api/prisma/schema.prisma`):
`Client` (code `@unique`, language MK|SQ|BOTH, status, reelsPerMonth, budgetUsd/spentUsd, metaAdAccountIds) → `ClientProfile[]` (верзии), `Avatar[]` (version, profile Json, status), `Product`, `Actor` (clientId null = GoDigital талент, languages[], canDo/cannotDo), `Location`, `Competitor` (status потврден/непотврден), `TrendReference` (flag INSPIRATION|DO_NOT_COPY), `GlossaryTerm` (PREFERRED|BANNED|PRODUCT_NAME), `Insight` (Ф2), `BrainChange` („Што е ново“).
`ScriptSet` (status, brief Json, requested) → `Concept[]` (type, avatarId, actorId, card Json, decision), `Script[]`.
`Script` (code `@unique`, type, language, content Json = кадри, markdown, status, criticReport Json, isStarExample, source GENERATED|IMPORTED) → `AdCreative[]` (Ф2) → `AdMetrics[]` (Ф2).
`AgentRun` (agentKind, model, sessionId, costUsd, status) → `Message[]`. `Approval`, `CostEntry`, `Template` (kind, version, active), `User` (role), `Notification`.

Индекси: `Message(runId, createdAt)`, `Script(clientId, type, status)`, `Concept(setId)`, `AgentRun(setId)`, `CostEntry(clientId, setId)`, HNSW/IVFFlat врз embedding колоните на `Script`/`TrendReference` (pgvector).

Миграции: `npx prisma migrate dev --name descriptive_name` — **никогаш** рачно менување на applied миграции. **Seed не е опционален** — без активни агент темплејти, забранети фрази и рубрика, првиот сет паѓа.

## Стандарден формат на сценарио (PRD §11)

Сите генерирани и увезени сценарија се нормализираат во форматот од PRD §11 (`domain/scriptFormat.ts`): секој **кадар** има улога (ХООК/БОДИ/ЦТА); режијата е одвоена од репликата; репликата секогаш носи име на актер во 600; „Монтажа:“ во одделен ред; бројки на екран одат и во табела. `content Json` = низа кадри `{ role, direction, lines[], editing?, table? }`. `markdown` е рендер на истата структура за docx експорт.

## Домен глосар (кирилица ↔ код)

| Домен (UI) | Код |
|---|---|
| Клиент | `Client` (`language: MK\|SQ\|BOTH`, `status: ClientStatus`) |
| Профил на клиентот (верзии) | `ClientProfile` (`version`, diff во UI) |
| Аватар купец | `Avatar` (`status: PENDING_CONFIRMATION\|ACTIVE\|RETIRED`, `profile Json`) |
| Продукт / Актер / Локација / Конкурент | `Product` / `Actor` / `Location` / `Competitor` |
| Тренд-референца | `TrendReference` (`flag: INSPIRATION\|DO_NOT_COPY`) |
| Речник термин | `GlossaryTerm` (`kind: PREFERRED\|BANNED\|PRODUCT_NAME`) |
| Што е ново | `BrainChange` (`kind`, `summary`) |
| Сет сценарија | `ScriptSet` (`status: SetStatus`, `brief Json`) |
| Концепт-карта | `Concept` (`type: ScriptType`, `decision: PENDING\|SELECTED\|REJECTED`) |
| Сценарио | `Script` (`code @unique`, `content Json`, `status`, `source: GENERATED\|IMPORTED`) |
| Тип сценарио | `ScriptType` (`PRODUCT_OFFER\|EDUCATIONAL\|TESTIMONIAL\|SKETCH`) |
| Оценка на Критичарот | `Script.criticReport Json` (11 критериуми, наоди) |
| Ѕвезда пример | `Script.isStarExample` |
| Агентска сесија | `AgentRun` (`agentKind`, `sessionId`, `model`, `status`) |
| Запис од транскрипт | `Message` (`role`, `content Json`) |
| Човечка одлука на чекпоинт | `Approval` (`checkpoint`, `decision`, `comment?`) |
| Трошок по повик | `CostEntry` (`agentKind`, `usd`) |
| System prompt со верзија | `Template` (`kind`, `version`, `active`) |
| Реклама / метрики (Ф2) | `AdCreative` (`metaAdId`, `mappingStatus`) / `AdMetrics` |
| Улоги | `Role.SCRIPTWRITER` / `Role.ADMIN` / `Role.VIEWER` |

## Четиринаесет екрани (Design Brief §7, README) — референца при имплементација

`/` Чека тебе (Inbox, стартна) · `/clients` Клиенти · `/clients/:id` Преглед · `/clients/:id/brain/:tab` Мозок · `/sets/new?client=` Бриф · `/sets/:id/concepts` Концепти (★1) · `/sets/:id/scripts/:scriptId` Сценарија (★2, херој) · `/sets/:id/export` Експорт · `/sets/:id` Транскрипти/Трошок · `/scripts` База на сценарија · `/results` Резултати (Ф2) · `/import` Увоз · `/reports` Извештаи · `/settings/:tab` Поставки (Admin).

Приоритет на градење (Design Brief §12): **7.8 Сценарија → 7.7 Концепти → 7.1 Inbox → 7.6 Бриф → Клиент/Мозок → останатите.** Компонентна библиотека прво.

## Дизајн систем (Design Brief §4, README — токени се финални, не се заменуваат)

Токени во Tailwind config како семантички имиња (без произволни hex во компоненти):
`paper #F5F6F4` (позадина, ладно-неутрална, **не крем**) · `sheet #FFFFFF` (површини за читање) · `ink #1B1F24` (примарен текст/копче) · `ink-2 #5A6270` (секундарен, режија) · `rule #D9DDE3` (1px рамки, **без сенки**) · `signal #E4572E` (**само** „чека тебе“: чекпоинт беџови, Одобри/Пиши ги избраните/Испрати, Inbox бројач) · `ok #2F7D4F` · `hold #B7791F` · `fail #9B2C2C`.

**Апсолутно правило: `signal` се појавува НИКАДЕ освен каде човек мора да одлучи.** Целосно одобрен сет е практично црно-бел. Без темна тема во v1.

Типографија: **IBM Plex Sans** (400/500/600, целиот интерфејс, без 300/700+) + **IBM Plex Mono** (само текст на сценарија и кодови). Скала 13/14/16/20/28. Сценарио 16px mono, line-height 1.7, max 68 знаци. Наслови sentence case. Кирилица тестирана со Ѓ Ќ Ѕ Џ Љ Њ и Ç Ë во сите тежини. Забрането: ALL-CAPS етикети (освен ХООК/БОДИ/ЦТА), tracked-out eyebrows, „→“ на копчиња, средни точки во наслови.

Распоред: лева навигација 240px, содржина max 1280px, детал = 65%/35%. Радиус 6px контроли, 10px листови. Едно движење: Inbox беџ пулсира **еднаш** до `signal` кога нешто ново чека; `prefers-reduced-motion` гаси сè.

**Тест за секоја визуелна одлука:** одговара ли екранот на „што чека мене сега?“ во првата секунда? Ако бојата `signal` не значи одлука-за-тебе, се брише.

## Компоненти кои мора да постојат (Design Brief §8)

`StatusBadge` · `CheckpointBar` (единствената со `signal` копче) · `ScriptView` + `ScriptEditor` (идентичен изглед, read-only и уредлива) · `ConceptCard` · `PersonCard` (актер) · `PlaceCard` (локација) · `AvatarCard` (со линија на покриеност) · `CriticScore` (11 критериуми + „скокни до кадар“) · `WhatsNewList` · `DiffView` · `AgentStatusLine` (текст статус, **без спинер**) · `TranscriptViewer` · `ContextSheet` (десна колона / долен sheet на мобилен) · `EmptyState` · `ErrorState` · `Toast` · `ConfirmDialog` · инлајн-уредлива табела.

## Забрани (Design Brief §11 — почитувај ги)

- Крем позадина + теракота акцент; темна тема + неонски акцент; „SaaS kit“ со идентични картички и сива сенка.
- Спинери, „размислувам…“ анимации, gradient позадини, декоративни илустрации на роботи/мозоци.
- **Chat интерфејс за работа со агентите.** Слободен текст кон агент постои **само** во брифот и во „Врати со коментар“.
- Графикони заради графикони (Ф1 нема ниту еден; Ф2 само хоризонтални ленти и една временска линија).
- Англиски термини во UI освен кодови, имиња на модели во Поставки, технички логови.
- **Имиња на агенти/модели никогаш во главниот тек** („Се пишуваат сценарија“, не „Writer Agent is running“) — само во Поставки и Транскрипти.

## Конвенции

- **API responses:** `{ data }` или `{ error: { code, message, details? } }`. Сите патеки под `/api/v1`, `Authorization: Bearer <jwt>` освен `/auth/login`. Zod валидација на секое тело пред сервисниот слој; schemas споделени со frontend форми.
- **Error codes** (`SCREAMING_SNAKE`, `message` на македонски): `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `WRONG_STATUS` (409), `DUPLICATE_CODE` (409), `COMMENT_REQUIRED` (422), `MISSING_ACTOR` (422), `BUDGET_EXCEEDED` (423), `RATE_LIMITED` (429), `AGENT_FAILED` (500).
- **SSE:** една врска по отворен сет; настани `message`, `run.started/finished`, `status.changed`, `cost.updated`, `concept.ready`, `script.ready`, `notification.sent`, `ping` (25s). Секој настан носи `id`; reconnect преку `Last-Event-ID`. Преку Redis pub/sub.
- **Компоненти:** PascalCase, colocated (`ScriptView/ScriptView.tsx` + `useScriptView.ts`). Податоци секогаш низ TanStack Query.
- **Tailwind:** само семантички токени. Без произволни hex во компоненти.
- **Тестови:** Vitest, colocated `*.test.ts`. `domain/` и state machines = 100%. Парсерот за увоз и `scriptFormat`/`code` генераторот = висок приоритет.
- **Git:** conventional commits (`feat:`, `fix:`…); гранка по тикет: `feat/GS-12-set-machine`. **Commit/push само на барање.**
- **Задачи:** водат се преку **`Backlog.md`** (не Trello) — проектот го куца еден агент.

## Работен процес на Claude Code сесии

1. Прочитај го тикетот + релевантната секција од PRD / Design Brief / Техничка документација **пред** код. Кликни низ прототипот пред UI работа.
2. Редослед по функционалност: типови/Zod schemas → `domain/` + тест → service → route → frontend hook → компонента.
3. По секоја функционалност: `npm run typecheck && npm run test && npm run lint` — **мора зелено** пред commit.
4. **Не воведувај нови dependencies без прашање.**
5. Миграции: `npx prisma migrate dev --name descriptive_name` — никогаш рачно менување на applied миграции.
6. **Seed не е опционален** — без активни агент темплејти, рубрика и забранети фрази првиот сет паѓа.
7. Ако задачата бара да заобиколиш инваријанта од горната листа — **застани и прашај.** Тоа е знак дека нешто во спецификацијата не е дорешено.

## Блокови на имплементација (види `ImplementationPlan.md` / `Backlog.md` — редослед е задолжителен)

1. **Основа и домен** (Спринт 1): monorepo, docker-compose (Postgres+pgvector, Redis, Nginx), `env.ts`, Prisma схема+индекси, `clientMachine`/`setMachine`, `checkpoints`/`budget`/`critic`/`scriptFormat`/`code`, unit тестови, `seed.ts`. Паралелно Ф0: увоз екран + парсер.
2. **Автентикација и Client Brain CRUD** (Спринт 1–2): JWT+bcrypt, RBAC, клиент + intake со upload, CRUD за сите Brain ентитети, транслитерација кирилица→код.
3. **Агенти и редови** (Спринт 2, најризичен): `sdk.ts` (sessionId resume, Max + API fallback), BullMQ+workers, retry/rate-limit, Message во тек, CostEntry, Client Analyst + Q&A resume, Avatar Builder, Approval + верзии/diff, „Што е ново“, SSE транскрипти.
4. **Сет flow** (Спринт 3): Бриф, Creative Director → концепти → одбирање, паралелни Writer, Critic + auto-revision, Сет детали + инлајн едитор + верзии, ревизија во иста сесија, експорт docx/markdown, база со семантичко пребарување.
5. **Операција** (Спринт 4): Inbox „Чека тебе“, нотификации, буџети/BUDGET_HOLD, Поставки (темплејти, рубрика, забранети фрази, модел-рутирање), извештаи, mobile UI, работилница за system prompts.

**Definition of Done за Фаза 1:** Александар и Стефан секој завршуваат по 3 реални сета низ системот (бриф → концепти → сценарија → критика → одобрување → docx) без Claude.ai и без copy-paste; секое сценарио има аватар, актер, локација и код; сите транскрипти, трошоци и одобрувања се во dashboard; трите пилот клиенти имаат целосен Client Brain и увезени стари сценарија.
