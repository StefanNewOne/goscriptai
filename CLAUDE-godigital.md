# CLAUDE.md — GoDigital OS

Овој фајл го чита Claude Code на секоја сесија. Строго почитувај сè подолу.
Референтни документи: `docs/master-plan-v2.1.md` (PRD — извор на вистина), `docs/openapi.yaml`, `docs/user-flows-v2.1.md`, и **дизајн пакетот** `design_handoff_godigital_os/` (живи HTML прототипи = спецификација на однесување; `Роља 01–12` = спецификација екран-по-екран; `Матрица` = event→task→канал; `Dizajn Sistem` = финални токени). Реизградба high-fidelity: бои, типографија, растојанија, копија и интеракции од прототипот се финални. При конфликт: Master Plan §15 ги решава познатите; за нови — прашај.

## Проект

GoDigital OS — multi-tenant оперативен систем за маркетинг агенции: content production pipeline (видео + графики) со state machines, повеќестепени одобрувања, месечни циклуси како квота-тракери, календар на објави, метрики, наплата со деградација, пресметка на трошок и маргина, CRM/онбординг со e-signature, AI асистенти и мулти-агент четбот.

## Stack (НЕ менувај без експлицитна одлука)

- **Frontend:** React 19 + TypeScript (strict) + Vite + TailwindCSS + Zustand (UI state) + TanStack Query (server state)
- **Backend:** Node.js 22 + Express + Prisma + PostgreSQL 16 (+ pgvector) + Redis + BullMQ
- **Инфра:** Docker Compose, S3-компатибилен storage, ffmpeg worker
- **AI:** Claude API преку backend proxy (НИКОГАШ API клуч на frontend)

## Структура на repo (monorepo)

```
/apps
  /web        # интерна web апликација
  /client-pwa # клиентска PWA
  /api        # Express backend
  /worker     # BullMQ jobs + ffmpeg
/packages
  /shared     # Zod schemas, типови, константи, state machines, strings
  /ui         # заеднички React компоненти + design tokens
/prisma       # schema.prisma, миграции, seed
/docs
```

## Јазик и текстови

- **Сите UI strings: македонска кирилица.** Технички термини остануваат англиски (pipeline, upload, dashboard).
- UI strings во `packages/shared/src/strings/mk.ts` — НИКОГАШ hardcoded во компоненти.
- Код, коментари, имиња на променливи, commit пораки: англиски.
- Датуми во UI: `DD.MM.YYYY`, време 24h. Валута default EUR.
- Контентот има `language` поле (`mk` | `sq` | `en`) — тоа е јазик на **испораката до клиент**, различно од јазикот на UI.

---

## ТВРДИ ИНВАРИЈАНТИ — прекршување е bug, не стилска разлика

### 1. Tenant scope
`tenantId` доаѓа **исклучиво од JWT claim**, никогаш од request body, query параметар или header. Секој Prisma query е scoped преку middleware во `apps/api/src/db/tenantExtension.ts` — не се потпираме на дисциплина на девелоперот. Tenant-scoped се и: S3 патеки, Redis клучеви, BullMQ job payload-и и pgvector RAG retrieval.

Ако пишуваш raw SQL или `$queryRaw` — `tenantId` условот е задолжителен и мора да има тест.

### 2. Статус се менува само преку transition функција
```ts
transitionContentPiece(pieceId, toStatus, actor, ctx)
transitionCycle(...) | transitionShoot(...) | transitionBilling(...) | transitionContract(...)
```
Никогаш `prisma.contentPiece.update({ data: { status } })`. Transition функцијата: валидира по state machine, проверува RBAC, **проверува billing guard**, пишува AuditLog, креира downstream таскови/нотификации, **креира `CostEntry` каде е дефинирано**.

### 3. CostEntry е автоматски, никогаш рачен
Се креира во transition side-effects по мапата од Master Plan §5.3.4. Рачно внесување трошок не постои како функционалност — податокот што не е потполн е бескорисен.

При ревизија: **нов** `CostEntry` со `isRevision = true` + `revisionReason`, не update на постоечкиот.

### 4. Billing guard пред продукциски акции
```ts
assertBillingAllows(clientId, action)
```
- `SUSPENDED` → блокирано: креирање парче, транзиција во `SCHEDULED`, објавување. Дозволено: довршување на парчиња што се веќе во `IN_EDITING` или подоцна (grace).
- `OVERDUE` → блокирано само креирање нови парчиња.
- Активен `overrideUntil` → се третира како `CURRENT`.

### 4b. Код на парче — `ММ-ББ`
Секое `ContentPiece` добива код при креирање (пр. `08-03`; интервентни `08-И1`), автоматски, реден по клиент по месец, **неменлив** (`@@unique([clientId, code])`). Кодот се прикажува насекаде и **се вметнува во копито при објава** — тој е клучот за Мета спарување (`MatchStatus`). Генерирањето е во service слојот, атомско (без race при паралелно креирање).

### 4c. Интервентно парче ⚡
Тип Реел/Графика/Сценарио/Снимање од модалот = вистинско `ContentPiece` со `isIntervent=true`, `countsToQuota=false`, код `ММ-Иx`, URGENT таск. Маргината го смета како вонреден трошок. Само тип „Друго“ е чиста `Task`.

### 4d. Ads правила се код, не проценка
Влез во decision queue: реел — дневни прегледи паѓаат преку 70% vs вчера ИЛИ под 1.000/ден; никогаш над 3.000 = `weakOrganic`; додека расте не влегува. Carousel/single — над 2.000 прегледи или 200 кликови за 48ч. Одлуката е форма (цел + буџет 50/100/150/250 + 3/7/14/30 дена + платформи). `Package.adsBudgetMonthly` пробивање = **блокада** (`ADS_BUDGET_EXCEEDED`), не warning. Агенциски лимит: аларм на 80%.

### 5. Циклусот е квота-тракер, НЕ batch
Парче тргнува веднаш штом е креирано. **Не постои** `start-production` endpoint ниту `PLANNING_INCOMPLETE` грешка. Првото креирано парче автоматски го носи циклусот во `IN_PRODUCTION`.

`QUOTA_EXCEEDED` е предупредување со `allowOverride` за Owner, не тврда блокада.

### 6. Одделни auth realms
`User` и `ClientUser` — одделни JWT secrets, одделни рути (`/auth/*` vs `/auth/client/*`), одделен middleware. Никогаш мешање. Клиентски токен на интерна рута = 401.

### 7. Client-scope
Интерен корисник гледа само доделени клиенти (`ClientAssignment`); `ClientUser` само својот `clientId`. Guard: `requireClientAccess(clientId)`.

### 8. Трошок и маргина се само за Owner
`RateCard`, `CostEntry`, `UserCapacity.monthlySalary`, маргина — RBAC `OWNER` на API ниво. Вработен не смее да ја види ни својата ни туѓата цена по испорака. Ова не е UI работа — мора да е серверски.

### 8b. Чет
`ChatThread` kind TEAM (еден по tenant) или CLIENT_GROUP (еден по клиент; иста нишка во PWA и web dock). WebSocket/SSE. Забелешки на парче НИКОГАШ низ чет — само преку approvals. АМ добива таск при клиентска порака (SLA 24ч).

### 8c. Нотификации
Канали: SYSTEM (секогаш) / EMAIL (одлуки) / VIBER (URGENT). Правило: рутина = систем; чека-одлука = систем + email; циклус-во-ризик и пари = сите канали (URGENT пробива тивки часови 22–08). Дефиниции по роља во Подесувања; мапата е во „Матрица - Таскови и Нотификации“ — имплементирај ја како конфигурациска табела, не hardcoded услови.

### 9. Останато
- Validation со Zod на секој endpoint; schemas во `packages/shared`, споделени со frontend форми
- Нема бизнис логика во React компоненти: компонента → hook (TanStack Query) → API. Backend: route → controller (тенок) → service (логика) → Prisma
- Пари: Prisma `Decimal`, никогаш float. Времиња: UTC во база, `Europe/Skopje` само за прикажување
- Фајлови преку presigned URLs — фронтендот никогаш не праќа фајл низ API серверот
- Секоја mutation пишува `AuditLog`

---

## Конвенции

- Компоненти: PascalCase, colocated: `PipelineBoard/PipelineBoard.tsx` + `usePipelineBoard.ts`
- Hooks: `useContentPieces(filters)`, mutations: `useTransitionPiece()`
- Zustand само за UI state (отворени панели, филтри); податоци секогаш низ TanStack Query
- API responses: `{ data }` или `{ error: { code, message, details? } }`. Error codes `SCREAMING_SNAKE`: `INVALID_TRANSITION`, `TRANSITION_ROLE_DENIED`, `CLIENT_SCOPE_DENIED`, `TENANT_SCOPE_DENIED`, `BILLING_BLOCKED`, `QUOTA_EXCEEDED`, `CONTRACT_REQUIRED`, `COMMENT_REQUIRED`
- Tailwind: САМО tokens од `packages/ui/tokens` — вредностите се финалните од „Dizajn Sistem“ во handoff-от (Unbounded / IBM Plex Sans / JetBrains Mono; dark интерно `#0B1018` фамилија, light PWA `#F4F6F9` фамилија). Статусните бои се семантички (`status-client-review`, `billing-suspended`, `brief-incomplete`). Без произволни hex во компоненти
- Тестови: Vitest, colocated `*.test.ts`. State machines = 100% покриеност
- Git: конвенционални commits, гранка по тикет `feat/GD-123-shoot-modes`

## Домен глосар (кирилица ↔ код)

| Домен (UI) | Код |
|---|---|
| Парче контент / видео / графика | `ContentPiece` (`VIDEO_REEL`, `GRAPHIC_SINGLE`, `GRAPHIC_CAROUSEL`) |
| Месечен циклус (квота-тракер) | `MonthlyCycle` |
| Снимање | `Shoot` (`AGENCY_CREW` / `CLIENT_SELF` / `HYBRID`) |
| Инструкциски лист / shot list | `ContentVersion.shotList`, `Shoot.instructionsUrl` |
| Чека материјал од клиент | `AWAITING_CLIENT_FOOTAGE` |
| QA на материјал | `FOOTAGE_QA` |
| Доснимување | `reshootCount`, `QA_RESHOOT` |
| Одобрување | `ApprovalRequest` / `ApprovalAction` |
| Сценарио | `ContentVersion.scriptText` на `VIDEO_REEL` |
| Ревизија | `revisionCount`, `CostEntry(isRevision, revisionReason)` |
| Закажана објава | `ScheduledPost` |
| Интервентен таск / парче ⚡ | тип „Друго“ = `Task URGENT`; Реел/Графика/Сценарио/Снимање = `ContentPiece.isIntervent` |
| Код на парче | `ContentPiece.code` (пр. `08-03`, `08-И1`) |
| Чет / група по клиент | `ChatThread` (TEAM / CLIENT_GROUP) |
| Спарен пост | `ScheduledPost.metaPostIds` + `MatchStatus` |
| Фактура | `Invoice` |
| Состојба на наплата | `BillingState` (`CURRENT`/`DUE`/`OVERDUE`/`SUSPENDED`/`WRITE_OFF`) |
| Простор / одложување | `overrideUntil`, `overrideReason` |
| Ценовник (интерен трошок) | `RateCard` |
| Трошок по испорака | `CostEntry` |
| Капацитет | `UserCapacity` |
| Маргина | пресметка, не модел — `/owner/margin` |
| Брз влез | `entryType = QUICK_START` |
| Бриф некомплетен | `briefStatus = INCOMPLETE` |
| Банка на контент | `BankItem` |
| Режисер / Сценарист / Камерман / Монтажер | `DIRECTOR` / `SCRIPTWRITER` / `CAMERAMAN` / `EDITOR` |
| Графички Директор / Дизајнер | `GRAPHIC_DIRECTOR` / `GRAPHIC_DESIGNER` |
| Акаунт Менаџер / Мета Аналитичар / Продажен Агент | `ACCOUNT_MANAGER` / `META_ANALYST` / `SALES_AGENT` |

## State machines — извор на вистина

Дефинициите се во `packages/shared/src/state-machines/*.ts` како explicit мапи:

```ts
export const VIDEO_TRANSITIONS: TransitionMap<ContentStatus> = {
  SHOOT_PLANNING: {
    to: ['SHOOT_SCHEDULED', 'AWAITING_CLIENT_FOOTAGE'],
    allowedRoles: ['DIRECTOR', 'OWNER'],
    guard: (ctx) =>
      ctx.toStatus === 'AWAITING_CLIENT_FOOTAGE'
        ? ctx.shoot.mode !== 'AGENCY_CREW'
        : ctx.shoot.mode !== 'CLIENT_SELF',
  },
  FOOTAGE_QA: {
    to: ['IN_EDITING', 'AWAITING_CLIENT_FOOTAGE'],
    allowedRoles: ['DIRECTOR', 'OWNER'],
    sideEffects: ['COST_FOOTAGE_QA', 'INCREMENT_RESHOOT_ON_RETURN'],
  },
  // ... целосно по Master Plan v2.0 §5.1 / §5.2
}
```

Ако PRD и код се разликуваат — **PRD победува**; прашај пред да имплементираш отстапка.

## AI интеграција

- Claude API повици само во `apps/api/src/services/ai/`, со rate limiting по корисник/клиент (Redis)
- RAG: pgvector табела `content_embeddings`; job `ai.embed` on-event; **retrieval scoped на `tenantId` + дозволени клиенти**
- Клиентски AI: **4 агенти** (Маркетинг / Сметководител / Правник / Ментор); RAG база по клиент (документи од Подесувања); непокриено прашање → запис во „Непокриени прашања“ кај Owner; `disclaimerMk` е дел од идентитетот на агентот
- Квота по пакет (`Package.chatQuota`) проверена пред секој повик
- AI одговори секогаш означени како предлог во UI — никогаш auto-apply. Инструкцискиот лист оди кај клиент само по одобрување од Режисер

## Работен процес на Claude Code сесии

1. Прочитај го тикетот + релевантната секција од Master Plan v2.0 пред код
2. Редослед: типови/schemas во `packages/shared` → backend service + тест → рута → frontend hook → компонента
3. По секоја функционалност: `npm run typecheck && npm run test && npm run lint` — мора зелено пред commit
4. Не воведувај нови dependencies без прашање
5. Миграции: `npx prisma migrate dev --name descriptive_name` — никогаш рачно менување на applied миграции
6. Ако задачата бара да заобиколиш инваријанта од горната листа — **застани и прашај**, тоа е знак дека нешто во спецификацијата не е дорешено
