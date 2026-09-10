# Backlog — GoScriptAI

Тикети по спринт. `GS-NN`. Статус: `TODO` · `WIP` · `DONE` · `BLOCKED`. Зависности во заграда. Секој тикет е зелен само по `typecheck && test && lint`. `domain/` тикети бараат 100% покриеност.

Легенда за големина: S ≤ пола ден · M ден · L 2+ дена.

---

## Спринт 1 — Скелет и домен

| ID | Наслов | Опис / прифаќање | Размер | Зависи |
|---|---|---|---|---|
| GS-01 | Monorepo скелет | npm workspaces `api`+`web`, TS strict, ESLint+Prettier, Vitest, root scripts (`typecheck/test/lint`). `npm run typecheck` зелено на празно. | M | — |
| GS-02 | docker-compose + env | Postgres16+pgvector, Redis7, Nginx, api, web сервиси; `.env.example`; `api/src/env.ts` (Zod, паѓа при недостаток). `docker compose up` крева Postgres+Redis. | M | GS-01 |
| GS-03 | Fastify bootstrap | `server.ts`: jwt/cors/multipart плагини, graceful shutdown, `/health`, error handler со `{error:{code,message}}`. | S | GS-02 |
| GS-04 | Prisma схема + миграција | Сите модели од PRD §15 + enums (Language, ClientStatus, SetStatus, ScriptType, Role) + индекси + pgvector колони. Прва миграција применета. | L | GS-02 |
| GS-05 | `domain/clientMachine.ts` | Explicit мапа DRAFT→…→ACTIVE, guard/allowedRoles/sideEffects, чекпоинти `*`. **100% тест.** | M | GS-01 |
| GS-06 | `domain/setMachine.ts` | Set flow + специјални (PAUSED/FAILED/BUDGET_HOLD), prevStatus. **100% тест.** | M | GS-01 |
| GS-07 | `domain/budget.ts` | 80% warn, 100% BUDGET_HOLD, кревање→prevStatus. **100% тест.** | S | GS-01 |
| GS-08 | `domain/critic.ts` | Праг сите≥3 И вкупно≥80%, auto-revision ≤2, CRITIC_FAILED. **100% тест.** | S | GS-01 |
| GS-09 | `domain/code.ts` | `{CLIENT_CODE}-{YYMM}-{NN}`, следен слободен NN, `-MK/-SQ` суфикс за BOTH. **100% тест.** | S | GS-01 |
| GS-10 | `domain/scriptFormat.ts` | `content Json` ↔ markdown нормализација §11 (улоги, режија/реплика/монтажа/табела). **100% тест.** | M | GS-01 |
| GS-11 | `seed.ts` | Агент темплејти (5), рубрика (11), забранети фрази по јазик, модел-рутирање, users, пилот „Алекс Дизајн“ + актери + сценарија verbatim од `data.js`. Идемпотентно. | M | GS-04, GS-10 |
| GS-12 | JWT + RBAC | bcrypt, `/auth/login`, `requireRole` middleware, серверски guard на секој endpoint. Viewer POST → 403 тест. | M | GS-03, GS-04 |
| GS-13 | Client CRUD + intake | `GET/POST/PATCH /clients`, транслитерација→code, intake (URL, upload docx/слики, бриф, јазик, договор). | M | GS-12 |
| GS-14 | Brain ентитети CRUD | Продукти/Актери/Локации/Конкуренти/Референци/Речник — service+route+Zod. Инлајн-уредлива табела за Продукти (optimistic). | L | GS-13 |
| GS-15 | `import/parser` | `POST /import/parse` docx/md/paste → кадри (ХООК прв, ЦТА последен), предупредувања, мулти-фајл, дупликат код→следен NN. **тест на парсер.** | L | GS-10 |
| GS-16 | Web скелет + токени | Vite+React+Tailwind, семантички токени §4.2, IBM Plex фонтови, router, i18n `mk`, лева навигација 240px, топ бар. | M | GS-01 |
| GS-17 | Компонентна библиотека v1 | `StatusBadge`, `EmptyState`, `ErrorState`, `Toast`, `ConfirmDialog`, инлајн табела, `AvatarCard`, `WhatsNewList`. Storybook опц. | L | GS-16 |
| GS-18 | Екран Клиенти + Преглед | `/clients` листа (покриеност на аватари, чека беџ), `/clients/:id` Преглед (Што е ново, покриеност, сетови). | M | GS-14, GS-17 |
| GS-19 | Екран Мозок (CRUD табови) | `/clients/:id/brain/:tab` за сите ентитети (форми/картони по README §4). | L | GS-14, GS-17 |
| GS-20 | Екран Увоз | 4 состојби, споредба нормализирано↔оригинал, полиња + зачувај. | M | GS-15, GS-17 |

## Спринт 2 — Client Brain агенти

| ID | Наслов | Опис / прифаќање | Размер | Зависи |
|---|---|---|---|---|
| GS-21 | `agents/sdk.ts` | Agent SDK, sessionId resume, Max login + автоматски API fallback + нотификација, `ANTHROPIC_MAX_RETRIES=0`, prompt caching за Brain. | L | GS-04 |
| GS-22 | BullMQ + workers | `queues/index.ts`, worker по job тип, retry attempts:3 backoff, rate-limit пауза (не троши attempt), FAILED по 3. | M | GS-21 |
| GS-23 | Message во тек + CostEntry | Message се пишува додека тече сесија; CostEntry од SDK output; `spentUsd` ажурирање. | M | GS-22 |
| GS-24 | SSE + Redis pub/sub | `events/`, една врска по отворен ентитет, `Last-Event-ID`, настани од CLAUDE.md. `useStream` hook. | M | GS-22 |
| GS-25 | Client Analyst end-to-end | research→прашања→ClientProfile.md; `ANALYST_RUNNING/QUESTIONS/REVIEW`. | L | GS-22, GS-05 |
| GS-26 | Q&A екран + resume | Прашања како формулар (текст/избор/„не знам“), „Испрати одговори“ → resume иста сесија. | M | GS-25, GS-24 |
| GS-27 | Avatar Builder | 4–8 Avatar во PENDING_CONFIRMATION; AVATARS_RUNNING/REVIEW. | M | GS-25 |
| GS-28 | Approval + верзии + DiffView | Approve/Врати со коментар, ClientProfile верзии, mono diff панел, „Ажурирај анализа“. | M | GS-25, GS-17 |
| GS-29 | Што е ново + транскрипти live | `BrainChange` на секоја промена; `TranscriptViewer` live преку SSE; `AgentStatusLine`. | M | GS-24, GS-28 |

## Спринт 3 — Сет flow

| ID | Наслов | Опис / прифаќање | Размер | Зависи |
|---|---|---|---|---|
| GS-30 | Бриф екран + POST /sets | §9.2 полиња, enqueue Creative Director, навигација со статус „Се генерираат концепти“; корисник слободен. | M | GS-22, GS-06 |
| GS-31 | Creative Director + Концепти | N×2 карти; екран ★1 избери/отфрли/коментар/смени аватар; „Уште 3 карти“ иста сесија; „Пиши ги избраните“. | L | GS-30, GS-24 |
| GS-32 | Writer паралелно | По job по одбран концепт, независни; влез концепт+Brain+речник+ѕвезда примери+забранети фрази. Пад на еден не руши сет. | L | GS-31 |
| GS-33 | Critic + auto-revision | Рубрика 1–5, праг, ≤2 круга иста сесија, CRITIC_FAILED флаг. | M | GS-32, GS-08 |
| GS-34 | `ScriptView` + `ScriptEditor` | Screenplay типографија (кадри/улоги/режија/реплика/монтажа/табела), read-only + инлајн уредлива (верзија). | L | GS-17 |
| GS-35 | Сценарија екран (★2) | Листа+`ScriptView`+`CriticScore`(скокни до кадар)+`ContextSheet`+`CheckpointBar`; Одобри auto-advance; Врати со коментар resume. | L | GS-34, GS-33 |
| GS-36 | Експорт docx/md | `lib/docx.ts` §11 темплејт, `Експортирај документ` → линкови, код копирлив, сет→EXPORTED. | M | GS-35, GS-10 |
| GS-37 | База на сценарија + семантичко | `/scripts` пребарување (код/наслов/hook) + pgvector семантичко во исто поле, филтри, ѕвезда. | M | GS-04, GS-34 |
| GS-38 | Транскрипти/Трошок табови | Run табови, `TranscriptViewer`; трошок по агент + буџет бар. | S | GS-29, GS-23 |

## Спринт 4 — Операција

| ID | Наслов | Опис / прифаќање | Размер | Зависи |
|---|---|---|---|---|
| GS-39 | Inbox „Чека тебе“ | Стартна `/`, групи по тип, „само мои“, deep-link, беџ пулсира еднаш. | M | GS-35, GS-28 |
| GS-40 | Нотификации | `lib/ses.ts` + `lib/telegram.ts`, настани §19, директен линк, по корисник. | M | GS-24 |
| GS-41 | Буџети + BUDGET_HOLD | warn 80%, hold 100%, кревање/архивирање UI. | S | GS-07, GS-23 |
| GS-42 | Поставки (Admin) | Темплејти+верзии/историја, рубрика, забранети фрази, формат, модел-рутирање+fallback+буџети+Meta token маскиран, корисници/улоги/нотификации. | L | GS-12, GS-11 |
| GS-43 | Извештаи + PDF | По сет/клиент/месечно; трошок vs Max кредит; PDF експорт. | M | GS-23 |
| GS-44 | Mobile UI | Inbox/Концепти/Сценарија: лепливи акции ≥48px, screenplay 15px mono, долен sheet за контекст. | M | GS-35, GS-39 |
| GS-45 | E2E DoD тест | 3 реални сета по сценарист бриф→docx; чек-листа за прифаќање. | M | сите |

## Фаза 2 (само подготовка — не runtime)

| ID | Наслов | Опис | Размер |
|---|---|---|---|
| GS-F2-01 | Ад модели + статуси | `AdCreative`/`AdMetrics`/`Insight` веќе во схема; `LINKED_TO_ADS/LEARNED/ARCHIVED` дефинирани не извршени. | S |
| GS-F2-02 | Резултати екран (mock) | Shaped податоци зад flag, немапирани реклами, перцентил ленти. | M |

---

## Отворени одлуки што блокираат (PRD §21) — прашај на почеток на спринтот

- **Пред GS-11 (seed пилот):** потврди конвенција за код `ALEKS-2609-03` кај клиентите.
- **Пред Спринт 3:** работилница за system prompts (Creative Director/Writer/Critic).
- **Пред GS-32 (Writer):** албански — ист сценарист или посебен корисник?
- **Пред GS-11:** дали ѕвезда примери се означуваат рачно при увоз (за few-shot).
