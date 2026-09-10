# Верификација и аудит — GoScriptAI

Датум: 06.09.2026. Извршени: статичка анализа, два независни код-аудити (безбедност + коректност/инваријанти), и сеопфатен интеграциски + сигурносен тест-пакет.

## Резултати од тестирање

| Порта | Резултат |
|---|---|
| `npm run typecheck` (api + web) | ✅ 0 грешки |
| `npm run test` (домен unit) | ✅ 64 тестови, **100%** покриеност на `domain/` |
| `npm run test:integration` | ✅ **54/54** (auth, RBAC, валидација, бизнис-правила, безбедност, целосни агентски текови) |
| `npm run build` (web) | ✅ |

Интеграцискиот тест (`api/scripts/integration.ts`) го крева серверот во истиот процес против реалната база + Redis и покрива: најава/погрешни креденцијали/без токен/лош токен, RBAC граници (viewer/scriptwriter/admin), Zod валидација, дупликат код (клиент + сценарио), сет на неактивен клиент, увоз parse+commit, SSE токен проверка, отсуство на `passwordHash`/секрети во одговори, celиот onboarding тек (DRAFT→ACTIVE), celиот сет тек (бриф→docx), revision циклус (врати со коментар → нова верзија), cost tracking, Inbox, нотификации.

## Поправени наоди (од аудитите)

**Безбедност**
- **H1** `/settings/:key` GET/PUT сега прифаќа само allowlist на не-секретни клучеви (`model_routing`/`critic_rubric`/`banned_phrases`) — нема повеќе key-oracle. Секретите остануваат само во `.env`.
- **H2** `/scripts` search `type`/`status` сега се валидираат како enum (не влегуваат произволни стрингови во Prisma → нема 500).
- **SSE** отсуство на токен сега враќа `401` (претходно `400`).

**Коректност / инваријанти**
- **Заглавени сетови:** job што паднал по 3 обиди сега го носи сетот во `FAILED` (BullMQ `failed` handler) + нова рута `POST /sets/:id/retry` за рачен retry со resume на `prevStatus`.
- **Race на review:** `maybeReviewSet` сега е ограден на бројот на избрани концепти — брз критичар не може да го помести сетот додека паралелни писатели сè уште создаваат сценарија.
- **Врати со коментар:** `returnScript` сега го носи сетот во `REVISION` и назад во `SCRIPTS_REVIEW`, со `scripts_ready` нотификација (претходно десинхронизирано, без нотификација).
- **Валидни состојби:** `approveScript`/`returnScript` се оградени со `updateMany where status in (...)` — не може да се одобри сценарио во тек на пишување/критика.
- **Атомски трошок:** `recordCost` е сега `prisma.$transaction` — леџерот (`CostEntry`) и `spentUsd` не се разидуваат при пад.
- **Client-scope буџет:** `createSet` одбива нов сет ако клиентот е над буџет (`BUDGET_EXCEEDED`).
- **Boot reaper:** `AgentRun` заглавени во `RUNNING` (пад на процес) се означуваат `FAILED` при старт.
- **`ANTHROPIC_MAX_RETRIES=0`** сега се пропагира до `process.env` за SDK (retry е BullMQ, не SDK).
- **Индекс:** `Notification(userId, createdAt)` (миграција `notification_index`).

## Live-режим — подготвен (по аудитот)

- **Claude Agent SDK интеграција:** потврден `query()` API (v0.3.261); агентите користат **нативен структуриран JSON излез** (`outputFormat: {type:'json_schema', schema}`) со робусен fallback-парсер — наместо кревко парсирање текст. Сите шест агенти (Client Analyst, Avatar Builder, Creative Director, Writer, Critic) имаат live имплементација.
- **Session resume (inv. 4):** ✅ `AgentRun.sessionId` се снима; аналитичарот (профил фаза) и писателот (ревизија) ја **ресумираат** сесијата — контекстот не се плаќа двапати.
- **429/rate-limit (inv. 3):** ✅ `runQuery` распознава `rate_limit`/`overloaded`; BullMQ паузира 30s **без да троши обид**.

## Одложено (со причина)

- **SSE токен во URL:** прифатливо за интерна алатка; препорака за short-lived stream ticket подоцна.
- **Login rate-limiting + constant-time compare:** бара `@fastify/rate-limit`; timing-leak е минорен за интерна алатка.
- **Пагинација на листи/извештаи:** додади `take`/cursor кога податоците ќе пораснат (`searchScripts` веќе е ограден на 100).
- **pgvector HNSW/IVFFlat индекси:** за семантичко пребарување (Фаза 2, бара embeddings преку Claude API).
- **Client-level `BUDGET_HOLD` статус:** моментално се спречува нова работа (guard); полн hold-статус на клиент е поголема промена.

Ниту еден одложен наод не е блокатор за развојниот/stub режим; сите се насочени кон live-режим (вистински Claude модели) или скалирање.
