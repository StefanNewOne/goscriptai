# ImplementationPlan — GoScriptAI (Фаза 0 + Фаза 1)

Извор на вистина: `GoScriptAI_PRD_v1_0.md` (§22 план), `GoScriptAI_Design_Brief_v1_0.md` (§12 испорака), `CLAUDE.md`. Овој план го операционализира PRD §22 во технички редослед. **Редоследот не е предлог.** Секоја ставка мапира на тикет во `Backlog.md`.

## Принципи на извршување

- Вертикално по функционалност: **типови/Zod → `domain/` + тест → service → route → frontend hook → компонента.**
- `domain/` и state machines = **100% тест покриеност** пред да се гради UI врз нив.
- Секоја агентска фаза е BullMQ job со SSE; **никогаш** синхроно со HTTP.
- Ништо не се смета за готово без `npm run typecheck && npm run test && npm run lint` зелено.
- Ф2/Ф3 модели постојат во схемата; runtime **не се гради** (сиви во UI).

## Тек на податоци (за да е јасен целиот систем)

```
Intake (веб/докс/бриф) ──► Client Analyst (job) ──► прашања ──► ClientProfile.md (★review)
                                                                      │
                                              Avatar Builder (job) ──► Avatars (★confirm)
                                                                      │
   Рачно: Продукти · Актери · Локации · Конкуренти · Референци · Речник
                                                                      │
                                                                   ACTIVE клиент
                                                                      │
Бриф (сценарист, 3–5 мин) ──► Creative Director (job) ──► N×2 концепт-карти (★select)
                                                                      │
                        Writer ×N (паралелни jobs) ──► Critic (job, ≤2 auto-revision)
                                                                      │
                                                          Сценарија (★approve / edit / return)
                                                                      │
                                              Експорт docx+md ──► код == име на реклама
                                                                      │
                                                            [Ф2] Meta sync ──► метрики ──► инсајти
```

---

## Спринт 1 — Скелет и домен (≈1 недела)

**Цел:** repo што се крева со `docker compose up`, целосен модел на податоци, state machines со 100% тестови, автентикација, CRUD за клиент и Brain ентитети, увоз екран (Ф0 паралелно).

### 1A. Основа
- Monorepo npm workspaces (`api`, `web`), TS strict, ESLint/Prettier, Vitest.
- `docker-compose.yml`: Postgres 16 + pgvector, Redis 7, Nginx, api, web. `.env.example`.
- `api/src/env.ts` — Zod, паѓа при недостаток; без default за задолжителни.
- `api/src/server.ts` — Fastify bootstrap, плагини (jwt, cors, multipart), graceful shutdown, health.
- Prisma схема (PRD §15) + enums + индекси + pgvector; прва миграција.
- `web` bootstrap: Vite + React + Tailwind (семантички токени §4.2), IBM Plex Sans/Mono, router скелет, i18n `mk`.

### 1B. Домен (100% тестови)
- `domain/clientMachine.ts` — транзиции + guard + allowedRoles + sideEffects.
- `domain/setMachine.ts` — транзиции + специјални статуси.
- `domain/checkpoints.ts` — дефиниции на човечките чекпоинти.
- `domain/budget.ts` — 80% warn, 100% BUDGET_HOLD, кревање → prevStatus.
- `domain/critic.ts` — праг (сите ≥3 И вкупно ≥80%), auto-revision бројач ≤2.
- `domain/code.ts` — `{CLIENT_CODE}-{YYMM}-{NN}`, следен слободен NN.
- `domain/scriptFormat.ts` — нормализација на `content Json` ↔ markdown (§11).
- `seed.ts` — темплејти на агенти (5), рубрика (11 критериуми), забранети фрази по јазик, модел-рутирање, users, пилот клиент „Алекс Дизајн“ + актери Ајтов/Јуле + сценарија од `data.js`.

### 1C. Автентикација и клиент CRUD
- JWT + bcrypt, RBAC middleware (Scriptwriter/Admin/Viewer), `/auth/login`.
- `Client` CRUD + intake форма (веб URL, upload docx/слики, текст-бриф, јазик, договор).
- CRUD за Brain ентитети: Продукти, Актери, Локации, Конкуренти, Референци, Речник.
- Транслитерација кирилица → `code` предлог.
- Екрани: Клиенти (листа), Клиент Преглед, Client intake, Мозок табови (CRUD форми).

### 1D. Ф0 — Увоз (паралелно)
- `POST /import/parse` — docx/markdown/paste → нормализирани кадри (ХООК прв, ЦТА последен), предупредувања (нема ЦТА).
- Мулти-фајл batch, дупликат код → следен NN, кадар без улога → рачно.
- Увоз екран: 4 состојби (idle → parsing → parsed → saved), споредба нормализирано↔оригинал, полиња (клиент, код, тип, аватар, актер, датум, ѕвезда).

**Излез на Спринт 1:** клиент може да се создаде и пополни рачно; стари сценарија се увезуваат со код; state machines тестирани.

---

## Спринт 2 — Client Brain агенти (≈1 недела, најризичен)

**Цел:** Agent SDK интегриран со Max auth + API fallback; Client Analyst и Avatar Builder работат end-to-end со чекпоинти, верзии, diff и live транскрипти.

- `agents/sdk.ts` — `@anthropic-ai/claude-agent-sdk`, sessionId resume, Max login + автоматски API fallback + нотификација, `ANTHROPIC_MAX_RETRIES=0`.
- `queues/` — BullMQ index + workers (по job тип), retry `attempts:3` backoff, rate-limit пауза (не троши attempt), Message во тек, CostEntry од SDK output.
- `agents/clientAnalyst.ts` — research (WebFetch/WebSearch/Read) → прашања → ClientProfile.md.
- Q&A екран (прашања како формулар) + resume во иста сесија по одговори.
- `agents/avatarBuilder.ts` → 4–8 Avatar во `PENDING_CONFIRMATION`.
- Approval тек со верзии + `DiffView` (ClientProfile v3 → v4); „Ажурирај анализа“.
- `BrainChange` „Што е ново“ на секоја промена во Brain.
- `events/` Redis pub/sub → SSE; `TranscriptViewer` live; `AgentStatusLine`.
- Cost tracking по клиент; буџет warn 80%.

**Излез на Спринт 2:** нов клиент поминува DRAFT → ACTIVE низ системот со агенти и чекпоинти; трошок и транскрипти видливи.

---

## Спринт 3 — Сет flow (≈1 недела)

**Цел:** целосен пат од бриф до docx.

- Бриф екран (§9.2 полиња) + `POST /sets` → enqueue Creative Director; сценаристот е слободен да оди.
- `agents/creativeDirector.ts` → N×2 концепт-карти; Концепти екран (★1): избери/отфрли/коментар/смени аватар; „Уште 3 карти во оваа насока“ (иста сесија); „Пиши ги избраните“.
- `agents/writer.ts` — по еден job по одбран концепт, **паралелно**; влез: концепт + Brain + аватар + продукт + актер + локација + речник + 3–5 ѕвезда примери + забранети фрази.
- `agents/critic.ts` — рубрика 1–5, праг, auto-revision ≤2 во иста сесија, `CRITIC_FAILED` флаг.
- Сценарија екран (★2, херој): `ScriptView` screenplay типографија, `CriticScore` (скокни до кадар), `ContextSheet`, `CheckpointBar` (Одобри / Доработи рачно инлајн + верзија / Врати со коментар); auto-advance на следно што чека.
- Експорт екран: preview + `Експортирај документ` → `.docx` + `.md`, код копирлив; сет → EXPORTED.
- База на сценарија: пребарување (код/наслов/hook) + семантичко (pgvector) во исто поле, филтри, ѕвезда означување.
- Транскрипти/Трошок табови по сет.

**Излез на Спринт 3:** сценарист комплетира сет бриф→docx без copy-paste.

---

## Спринт 4 — Операција (≈1 недела)

**Цел:** секојдневна употреба, dashboard среќни патишта, поставки, извештаи, mobile.

- Inbox „Чека тебе“ (стартна) — сите чекпоинти од сите клиенти/сетови, групи по тип, „само мои“, deep-link во акцискиот екран; беџ пулсира еднаш.
- Нотификации: SES + Telegram по корисник; настани од PRD §19; секоја носи директен линк.
- Буџети: warn 80%, `BUDGET_HOLD` 100% со кревање/архивирање.
- Поставки (Admin): темплејти на агенти (верзии + историја), рубрика, забранети фрази, формат на сценарио, модел-рутирање + fallback + буџети + Meta token (маскиран), корисници/улоги/нотификации.
- Извештаи: по сет, по клиент, месечно + PDF експорт.
- Mobile: Inbox, Концепти, Сценарија (лепливи акции ≥48px, screenplay 15px mono).
- Работилница за system prompts со сценаристите (PO активност, не код).
- Тест: 3 реални сета по сценарист (DoD).

---

## Фаза 2 / Фаза 3 (следен PRD — само подготовка сега)

Модели `AdCreative`/`AdMetrics`/`Insight` постојат; статусите `LINKED_TO_ADS`/`LEARNED`/`ARCHIVED` во `setMachine` дефинирани но не извршени. Екрани Резултати (Ф2) shaped со репрезентативни бројки, зад flag, врзани дури по реален Meta sync. Competitor/Trend/Ads Performance/Insight Distiller/Strategist агенти сиви во UI.

## Ризици и одлуки што чекаат (PRD §21)

1. Конвенција за код `ALEKS-2609-03` — потврди пред seed на пилот клиенти.
2. Whisper API vs self-hosted (Ф3) — не блокира Ф1.
3. Почетни system prompts (Creative Director/Writer/Critic) — работилница пред Спринт 3.
4. „Ѕвезда“ примери означени рачно при увоз (потребно за few-shot пред метрики).
5. Албански сценарија — ист сценарист или посебен корисник за проверка на јазик.

**Дејство:** ставки 1, 3, 5 се блокирачки за соодветните спринтови — прашај го операторот на почеток на спринтот, не на крај.
