# CLAUDE.md — GoFactory

Овој фајл го чита Claude Code на **секоја** сесија. Строго почитувај сè подолу — тоа е столбот на проектот.

**Референтни документи (извор на вистина, по приоритет):**
1. `GoFactory_PRD_v1.0.md` — PRD, зошто системот постои и што влегува во Фаза 1
2. `handoff/GoFactory Техничка Документација.dc.html` — 16 секции: state machine, модел, API, SSE, BullMQ, Prisma схема, задачи (отвори во browser; не бара сервер)
3. `handoff/GoFactory v2.dc.html` — работен прототип со вистински state machine, сите 11 екрани (одиграј цел тек Intake → DELIVERED пред прва линија код)
4. `handoff/README.md` — редослед на читање и прв ден

**При конфликт: PRD победува. За неодредено — застани и прашај.** Не измислувај однесување што не е во спецификацијата.

---

## Проект

GoFactory е внатрешен **оркестрациски систем** кој го води целиот животен циклус на софтверски проект — од клиентски бриф до испорачан, тестиран, чист код — преку Claude Agent SDK агенти, со **пет задолжителни човечки чекпоинти**.

Принцип: **АИ ја работи механиката, човекот ги носи одлуките.** Операторот е режисер, не изведувач. GoFactory е внатрешен алат на GoCode/GoDigital — клиентите **никогаш** не добиваат сметка (Ф3 е одделно преку GoPreview).

Фаза 1 (овој опфат): Проекти + Intake, PO агент, полурачна Дизајн фаза, Tech Lead агент, документи со верзии, транскрипти во живо, трошок со буџет, рачен Quality Gate, извештаи, дневник, поставки. Dev/Reviewer/QA агентите се **Фаза 2** — статусите постојат во моделот, но не се извршуваат.

## Stack (НЕ менувај без експлицитна одлука)

- **Backend:** Node.js 22 + TypeScript (strict) + **Fastify** (НЕ Express)
- **База:** PostgreSQL 16 + Prisma ORM
- **Job queue:** BullMQ + Redis (агентските сесии траат минути — никогаш синхроно со HTTP)
- **АИ:** `@anthropic-ai/claude-agent-sdk`; автентикација преку **Claude Max претплата** (Claude Code login на серверот, PRD §6) — `ANTHROPIC_API_KEY` е опционален и се поставува само за метеринг режим. SDK-то го допира само `agents/sdk.ts`; модел-рутирање по агент од Поставки
- **Frontend:** React + Vite + TailwindCSS (SPA), TanStack Query за server state
- **Реал-тајм:** SSE преку Redis pub/sub (не polling, не директно од worker)
- **Инфра:** Docker Compose (Postgres 16 + Redis 7), Hetzner CX33, Nginx reverse proxy
- **Нотификации:** Amazon SES (email) + Telegram Bot API
- **Git:** GitHub приватни репоа, едно по проект, автоматски креирано

## Структура на репо (monorepo — npm workspaces: `api`, `web`)

```
gofactory/
├── package.json          # npm workspaces: api, web
├── CLAUDE.md             # стандардот што важи и за ОВОЈ репо
├── README.md · .env.example · docker-compose.yml
├── api/
│  ├── prisma/            # schema.prisma · migrations/ · seed.ts (дел од deploy)
│  └── src/
│     ├── server.ts       # Fastify bootstrap · плагини · graceful shutdown
│     ├── env.ts          # Zod валидација на околината — ПАЃА при недостаток
│     ├── routes/         # само HTTP: валидира → повика сервис → врати
│     ├── domain/         # ← срцето. НЕМА Fastify, НЕМА Prisma import
│     │  ├── stateMachine.ts   # СИТЕ дозволени транзиции на едно место
│     │  ├── checkpoints.ts     # петте чекпоинти и што бараат
│     │  ├── dod.ts             # десетте DoD ставки · кои се автоматски
│     │  └── budget.ts          # 80% · 100% · BUDGET_HOLD правила
│     ├── agents/         # дефиниции, не транспорт · sdk.ts (session resume)
│     ├── queues/         # index.ts + workers/ (еден фајл по ред)
│     ├── services/       # оркестрација: домен + база + редови
│     ├── events/         # Redis pub/sub → SSE
│     └── lib/            # github.ts · ses.ts · telegram.ts · gate.ts
└── web/
   └── src/               # main.tsx · router.tsx · screens/ (11) · components/ · hooks/ · lib/api.ts
```

## Јазик и текстови

- **Сите UI strings: македонска кирилица.** Технички термини остануваат англиски (pipeline, upload, dashboard, gate).
- UI strings централизирани — **НИКОГАШ hardcoded** во компоненти.
- Код, коментари, имиња на променливи, commit пораки: **англиски**.
- Датуми во UI: `DD.MM.YYYY`, време 24h. **Валута: USD** (буџетите и трошоците се во USD наспроти SDK кредитот).
- `error.message` од API е на македонски и се покажува директно на корисникот.

---

## ТВРДИ ИНВАРИЈАНТИ — прекршување е bug, не стилска разлика

### 1. Статус се менува само преку state machine
`stateMachine.ts` е **единственото** место што знае што после што. Секоја промена на статус минува преку transition функцијата која: валидира по дозволените транзиции, проверува RBAC, проверува guard-и, **пишува `LogEntry`**, креира downstream таскови/нотификации. Никогаш `prisma.project.update({ data: { status } })` надвор од овој слој. Ако route има `if` над статус — тоа му е местото во `domain/`.

Дваесет статуси (15 главен тек + 4 специјални + Ф2). Петте чекпоинти (★): `PO_PLAN_REVIEW`, `PRD_REVIEW`, `HANDOFF_REVIEW`, `PLAN_REVIEW`, `USER_TESTING`.

### 2. Ниту една транзиција без запис — `LogEntry` е append-only
Секоја промена на статус, секое одобрување, секоја нотификација пишува ред во `LogEntry`. **Никогаш update, никогаш delete** — само додавање. Тоа е основата при спор со клиент и при дебагирање. Секоја mutation пишува траг.

### 3. Ревизијата не убива сесија — `sessionId` е клучот
При `request_changes`, коментарот влезе во **истата** агентска сесија преку `sessionId` (Agent SDK resume). Контекстот е сочуван, истражувањето **не се плаќа повторно**, и се крева верзијата на документот. Ако агентот се убие и се стартува нов, целото истражување се плаќа од нула — затоа паузата (не kill) е задолжителна.

### 4. Ниту еден агентски повик од HTTP route — секогаш BullMQ job
Агентските сесии траат минути и не смеат да ја држат HTTP врската. Секој агентски повик е job во ред. Статусот се стрима кон dashboard преку SSE. Retry-то го води **BullMQ, не SDK** → `ANTHROPIC_MAX_RETRIES=0`.

Retry политика: `attempts: 3`, exponential backoff 30s → 60s → 120s.
- **Rate limit (429 од Anthropic)** → статус `RATE_LIMITED`, job враќање во ред, **НЕ се троши attempt** (автоматски, не бара оператор).
- **Timeout (25 мин)** → attempt **се троши**.
- По 3 потрошени attempt → `FAILED`, грешката се чува, потребен **рачен** retry (го нулира бројачот).

### 5. Message записи се пишуваат во тек на сесијата, не по завршување
Секоја порака, tool_use и tool_result се снима како `Message` **додека тече** сесијата — ништо не се губи ако сесијата падне. `Message` е најбрзо растечката табела (индекс `(agentRunId, createdAt)`, ретенција 12 месеци).

### 6. CostEntry е автоматски од SDK output
Трошокот се чита од SDK output и се запишува во `CostEntry` (по повик и периодично во долги сесии), а `Project.spentUsd` се ажурира. Рачно внесување трошок не постои.
- На **80%** од буџетот → предупредување (`warned80`).
- На **100%** → статус `BUDGET_HOLD`, сите агентски повици за проектот стануваат. Излез: кревање буџет (над потрошеното → враќање на `prevStatus`) или архивирање.

### 7. Границите на архитектурата не се преминуваат
- `domain/` **не увезува** Fastify ниту Prisma. Чисти функции над обични објекти → тестибилен без база.
- `routes/` **не содржи** бизнис логика. Валидира, повикува сервис, враќа.
- `stateMachine.ts` е единственото место што одлучува за статус.

### 8. RBAC е серверски, не UI работа
Две улоги: **Operator** (сè) и **Viewer** (read-only, стеснат на: листа проекти, документи+верзии, извештаи+PDF). `FORBIDDEN` при Viewer обид за дејство **не смее да зависи само од UI-то** — мора да е проверено серверски на секој endpoint.

### 9. GitHub репото се создава синхроно пред job-от
При Intake, приватното репо се создава **синхроно** пред да се стави BullMQ job. Ако создавањето падне (`GITHUB_UNAVAILABLE`, 503) → проектот **НЕ се создава воопшто**. Никогаш проект во недефинирана состојба.

### 10. DoD системски го блокира DELIVERED
`USER_TESTING` (★5) не може да одобри додека DoD не е **10/10**. Тоа не е препорака — тоа е бариера во кодот (`DOD_INCOMPLETE`, 409). Автоматските ставки (2–6) ги поставува Quality Gate; рачните (1, 9, 10) операторот.

### 11. Пари како Decimal, времиња UTC
Пари: Prisma `Decimal` (`@db.Decimal(10,2)` за буџет, `(10,4)` за трошок по повик), **никогаш float**. Времиња: UTC во база, `Europe/Skopje` само за прикажување.

### 12. Env валидација паѓа при стартување
`env.ts` со Zod ги валидира сите променливи при boot. **Ниту една вредност нема default во кодот** — системот паѓа при недостаток на задолжителна, и тоа е точното однесување. Секрети само во `.env` на серверот — никогаш во промптови, логови или git.

### 13. Транзициите се транскациски и resumable
Ниту еден пад не смее да остави проект во недефинирана состојба. Секоја фаза памети checkpoint; по пад/рестарт системот продолжува од последната завршена фаза, никогаш од нула. Специјалните статуси (`PAUSED`, `FAILED`, `BUDGET_HOLD`, `RATE_LIMITED`) го памтат `prevStatus` за враќање.

---

## State machine — извор на вистина (§1 од Тех. документација)

Главен тек:
```
DRAFT → PO_RESEARCH → PO_QUESTIONS → ★PO_PLAN_REVIEW → PRD_GENERATION
→ ★PRD_REVIEW → DESIGN_IN_PROGRESS → ★HANDOFF_REVIEW → TECHLEAD_RUNNING
→ ★PLAN_REVIEW → READY_FOR_DEV → [Ф1: MANUAL_DEV] → ★USER_TESTING
→ DELIVERED → ARCHIVED
```
Фаза 2 гранка (статуси постојат, не се извршуваат): `DEV_RUNNING → QUALITY_GATE → REVIEW_RUNNING → QA_RUNNING`, со `FEEDBACK_LOOP` (макс 3 круга).

Специјални (од секаде): `PAUSED` · `FAILED` · `BUDGET_HOLD` · `RATE_LIMITED`.

Дефиницијата е explicit мапа во `domain/stateMachine.ts` со `to[]`, `guard`, `sideEffects[]` по транзиција. **Ако PRD и код се разликуваат — PRD победува; прашај пред отстапка.** State machine и `domain/` = **100% тест покриеност** (највисок приоритет).

## Агенти (§7 од PRD)

| Агент | Модел (default) | Алатки | Влез | Излез |
|---|---|---|---|---|
| **PO** | Opus (research) / Sonnet (пишување) | WebSearch, Read | Бриф + intake одговори | Прашања; PLAN; PRD.md; DesignBrief.md |
| **Tech Lead** | Sonnet | Read | PRD + Hand-Off + CLAUDE.md темплејт | CLAUDE.md; ImplementationPlan.md; Backlog.md |
| **Reporter** | Haiku | — | Настани од базата | Резимеа за нотификации и Inbox |
| Dev / Reviewer / QA | Sonnet | (Ф2) | (Ф2) | (Ф2 — сиви во UI) |

Правила за сите агенти:
- Фиксен system prompt чуван како `Template` во базата (уредлив од Поставки, **со верзии**). Проектите во тек ја држат верзијата со која стартувале — никогаш под нозе.
- Секој run има max буџет (USD) и max траење (25 мин); надминување → `BUDGET_HOLD`/timeout по правилата.
- **Prompt caching задолжително** за документите што се повторуваат (CLAUDE.md, PRD).
- Rate limiting по проект каде има смисла; целиот транскрипт се снима (инваријанта 5).
- AI излезите се предлог во UI — операторот одобрува. Дизајн Hand-Off оди понатаму само по ★3.

## Домен глосар (кирилица ↔ код)

| Домен (UI) | Код |
|---|---|
| Проект | `Project` (`type: WEB\|SOFTWARE\|SAAS`, `mobileTarget: NONE\|PWA\|NATIVE`) |
| Документ со верзија | `Document` (`kind: BRIEF\|PLAN\|PRD\|DESIGN_BRIEF\|HANDOFF\|CLAUDE_MD\|IMPL_PLAN\|BACKLOG\|REVIEW\|QA`) |
| Агентска сесија | `AgentRun` (`sessionId`, `status: RUNNING\|DONE\|FAILED`) |
| Запис од транскрипт | `Message` (`role: system\|assistant\|tool_use\|tool_result`) |
| Човечка одлука на чекпоинт | `Approval` (`decision: approve\|request_changes`, `checkpoint`, `checkpointNo`) |
| Трошок по повик | `CostEntry` (`usd`, `agent`, `model`, `phase`) |
| Дневник (append-only) | `LogEntry` (`kind: transition\|approval\|notification`) |
| Нотификација | `Notification` (`channel: email\|telegram`) |
| System prompt со верзија | `Template` (`agentName`, `version`, `active`) |
| Клуч-вредност поставка | `Setting` (`key`, `value: Json`) |
| Буџет / потрошено / претходен статус | `budgetUsd` / `spentUsd` / `prevStatus` |
| Чекпоинт | ★1–5: `PO_PLAN_REVIEW`, `PRD_REVIEW`, `HANDOFF_REVIEW`, `PLAN_REVIEW`, `USER_TESTING` |
| Оператор / Прегледувач | `Role.OPERATOR` / `Role.VIEWER` |

## Единаесет екрани (§3 — референца при имплементација)

`01 /login` · `02 /projects` · `03 /projects/new` (Intake) · `04 /projects/:id` (детали, 6 таба) · `05 /inbox` („Те чека тебе") · `06 /projects/:id/questions` (Q&A) · `07 /projects/:id/design` (Hand-Off) · `08 /projects/:id/devpack` · `09 /reports` · `10 /journal` · `11 /settings`. UI: mobile-first (операторот одобрува од телефон — хит-таргети ≥ 44px).

## Quality Gate и Definition of Done (§9 PRD, §4 Тех.)

DoD (10 ставки; DELIVERED блокиран додека не се сите):
1. Сите Backlog ставки за опфатот имплементирани *(рачно)*
2. Lint + typecheck без грешки *(авто)*
3. Unit тестови поминуваат · покриеност ≥ 70% на core логика *(авто)*
4. Build поминува *(авто)*
5. `npm audit` без critical/high *(авто)*
6. Secrets scan чист *(авто)*
7. Reviewer Agent: нема наоди severity high *(Ф2)*
8. QA Agent: сообразност со PRD *(Ф2)*
9. README.md + .env.example + CHANGELOG.md постојат и точни *(рачно)*
10. Staging deploy работи и операторот одобрил *(★5)*

Gate pipeline (Ф1 рачно пуштлив, Ф2 автоматски): `lint → typecheck → unit tests → build → npm audit → secrets scan`. Резултатот по чекор влезе во `LogEntry` и ажурира DoD 2–6. `npm run gate` мора да е зелено пред прв commit.

## Конвенции

- **Backend слоеви:** route (тенок: валидација → сервис → одговор) → service (оркестрација) → domain (чиста логика) / Prisma. Нема бизнис логика во routes.
- **Frontend:** компонента → hook (TanStack Query) → `lib/api.ts`. Нема бизнис логика во React компоненти. Типовите на API генерирани од Zod schemas.
- **API responses:** `{ data }` или `{ error: { code, message, details? } }`. Сите патеки под `/api/v1`, `Authorization: Bearer <jwt>` освен `/auth/login`. Zod валидација на секое тело пред сервисниот слој.
- **Error codes** (`SCREAMING_SNAKE`, `message` на македонски): `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `WRONG_STATUS` (409), `HANDOFF_MISSING` (409), `DOD_INCOMPLETE` (409), `COMMENT_REQUIRED` (422), `BUDGET_EXCEEDED` (423), `RATE_LIMITED` (429), `AGENT_FAILED` (500), `GITHUB_UNAVAILABLE` (503).
- **SSE:** една врска по отворен проект; настани `message`, `run.started/finished`, `status.changed`, `cost.updated`, `document.created`, `notification.sent`, `ping` (25s). Секој настан носи `id`; reconnect преку `Last-Event-ID`. Настаните преку Redis pub/sub (не директно од worker — инаку не работи со повеќе инстанци).
- **Компоненти:** PascalCase, colocated (`ScreenName/ScreenName.tsx` + `useScreenName.ts`).
- **Tailwind:** дизајн токени (Instrument Serif / IBM Plex Sans / IBM Plex Mono; семантички статусни бои). Без произволни hex во компоненти.
- **Тестови:** Vitest, colocated `*.test.ts`. `domain/` и state machine = 100%.
- **Git:** conventional commits (`feat:`, `fix:`…); CHANGELOG се генерира од нив. Гранка по тикет: `feat/T-12-sdk-session-resume`.
- **Задачи:** водат се преку **Backlog** (`Backlog.md` / внатрешен таск систем на агентот), **не Trello** — проектот го куца еден агент.

## Работен процес на Claude Code сесии

1. Прочитај го тикетот + релевантната секција од Тех. документација / PRD **пред** код (§15 = задачи по приоритет; редоследот не е предлог).
2. Редослед по функционалност: типови/Zod schemas → `domain/` + тест → service → route → frontend hook → компонента.
3. По секоја функционалност: `npm run typecheck && npm run test && npm run lint` (или `npm run gate`) — **мора зелено** пред commit.
4. **Не воведувај нови dependencies без прашање.**
5. Миграции: `npx prisma migrate dev --name descriptive_name` — никогаш рачно менување на applied миграции.
6. Seed **не е опционален** — без активни агент темплејти првиот проект паѓа.
7. Ако задачата бара да заобиколиш инваријанта од горната листа — **застани и прашај.** Тоа е знак дека нешто во спецификацијата не е дорешено.

## Блокови на имплементација (§15 — редослед е задолжителен)

1. **Основа и домен** (3–4д): monorepo, docker-compose, `env.ts`, Prisma схема+индекси, `stateMachine.ts`, `checkpoints/dod/budget`, unit тестови, `seed.ts`.
2. **Автентикација и проекти** (3д): JWT+bcrypt, RBAC middleware, `GET/POST /projects`, транслитерација кирилица→slug, GitHub репо, upload+верзионирање, екрани 01–03.
3. **Агенти и редови** (5–6д, најризичен): `sdk.ts` (sessionId resume), BullMQ+workers, retry/rate-limit, Message во тек, CostEntry, PO агент end-to-end, Q&A resume.
4. **SSE и чекпоинти** (4д): Redis pub/sub → SSE, `useStream`, approve/request_changes, ревизија+resume, нотификации, екрани 04–06.
5. **Тек до испорака** (3–4д): промпт-пакет, Hand-Off, Quality Gate во Docker, специјални статуси, екрани 07–08.
6. **Извештаи, дневник, поставки** (3д): дневник со cursor пагинација, месечен/по-проект извештај + PDF, поставки со верзии, backup, екрани 09–11.
