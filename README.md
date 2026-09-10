# GoScriptAI

Внатрешен агентски систем за резултатски ориентирани реел-сценарија со човечки чекпоинти (GoDigital / GoCode).

Документи (извор на вистина): [`CLAUDE.md`](./CLAUDE.md) · [`ImplementationPlan.md`](./ImplementationPlan.md) · [`Backlog.md`](./Backlog.md) · `GoScriptAI_PRD_v1_0.md` · `GoScriptAI_Design_Brief_v1_0.md` · `design_handoff_goscriptai/`.

## Стек

Node.js 22 + TypeScript + Fastify · PostgreSQL 16 + pgvector + Prisma · BullMQ + Redis · React + Vite + Tailwind · Claude Agent SDK (Max + API fallback). Детали: `CLAUDE.md`.

## Структура

```
api/   Fastify backend (routes → services → domain / Prisma)
web/   React SPA (Sprint 1, GS-16)
```

## Локален развој

Портовите се изолирани од другите проекти (Postgres `5435`, Redis `6383`).

```bash
# 1. Env
cp .env.example .env        # и api/.env за Prisma/tsx

# 2. Инфраструктура
docker compose up -d db redis

# 3. Зависности
npm install

# 4. База + seed (seed НЕ е опционален — темплејти/рубрика/забранети фрази)
npm run prisma:migrate --workspace api
npm run seed --workspace api

# 5. Развој (во ДВА одделни терминали)
npm run dev:api             # http://localhost:3001/health
npm run dev:web             # http://localhost:5182  (proxy /api → :3001)
```

Демо најави (seed): `admin@godigital.mk` (Admin), `aleksandar@godigital.mk` и `stefan@godigital.mk` (Scriptwriter) — лозинка `goscript`.

Портови: API `3001`, Web `5182`, Postgres `5435`, Redis `6383` (изолирани од другите проекти на машината).

## Проверки

```bash
npm run typecheck           # сите workspace-и
npm run test                # Vitest; domain/ = 100% покриеност
npm run lint
```

## Статус

**Спринт 1 завршен · Спринт 2 (агенти) — Client Brain тек работи.**

Спринт 1:
- Скелет, docker, `env.ts`, Prisma схема + миграција, seed (идемпотентен).
- Домен: `clientMachine` · `setMachine` · `budget` · `critic` · `code` · `scriptFormat` · `checkpoints` — **100% тест покриеност** (64 тестови).
- Backend: Fastify, JWT + RBAC, Client CRUD + intake, Brain CRUD (6 ентитети), Увоз парсер + commit.
- Frontend: дизајн токени, IBM Plex, router, auth, TanStack Query; екрани Login · Inbox · Клиенти (+ Нов клиент форма) · Преглед · Мозок (9 табови).

Спринт 2 (агентски слој):
- `agents/sdk.ts` (Claude Agent SDK, **stub-режим** без Max login + live кога `AGENT_LIVE=1`/API клуч), `agents/registry.ts` (модел-рутирање од Поставки).
- BullMQ + in-process workers, SSE преку Redis pub/sub, AgentRun/Message/CostEntry, буџет-евалуација.
- **Client Analyst** (research → прашања → профил) + **Avatar Builder** — целосен onboarding тек потврден end-to-end преку BullMQ: `DRAFT → анализа → прашања → одговори → профил (★) → аватари (★) → MANUAL_SETUP → ACTIVE`, со cost tracking.
- Web `OnboardingPanel`: Пушти анализа · Q&A · Одобри/Врати профил · потврди аватари · Активирај.

Спринт 3 (Сет flow — срцето на продуктот):
- **Creative Director** → N×2 концепти · **паралелни Writers** (код `{CLIENT}-{YYMM}-{NN}` без race, retry-на-судир) · **Critic** (рубрика 11 критериуми, праг сите≥3 и ≥80%, auto-revision ≤2).
- Одобрување/Врати со коментар/рачна доработка (верзии) · **docx + markdown експорт** во стандарден формат §11.
- Целосно потврдено end-to-end: `Бриф → концепти → избор → пишување → критика → одобрување → APPROVED → docx → EXPORTED`, spentUsd tracking.
- Web: `NewSet` (Бриф), `SetDetail` (концепти ★1 · сценарија ★2 со `ScriptView` screenplay типографија · експорт со преземање).

Спринт 4 (операција):
- **Inbox агрегација** на сите чекпоинти (клиент + сет) со фиксен редослед групи + навигациски бројач што пулсира.
- **BUDGET_HOLD enforcement** (100% → пауза, кревање буџет → resume на prevStatus) во агентските работници.
- **Нотификации** (in-DB запис + pluggable SES/Telegram sender, no-op без креденцијали) со директен линк.
- **Увоз екран** (вметни → парсирај → преглед до оригинал → зачувај со код).
- **Поставки (Admin)**: агент темплејти со верзионирање (нова активна верзија), модел-рутирање, RBAC 403 за не-админ.

> Агентите одат во **stub-режим** без Claude Max login (детерминистички излез за развој). За вистински модели: `AGENT_LIVE=1` + Max login на серверот, или `ANTHROPIC_API_KEY`. Само `agents/sdk.ts` се менува.

Дополнително:
- **База на сценарија** (`/scripts`) — пребарување по код/наслов + тип/ѕвезда чипови, read-only `ScriptView`, означување ѕвезда пример.
- **Извештаи** (`/reports`) — месечно (сетови/сценарија/трошок по сценарист) и по клиент (исполнетост на договор со хоризонтална лента).
- **Инлајн `ScriptEditor`** — „Доработи рачно“ го претвора сценариото во уредливо со истата типографија; зачувувањето прави нова верзија.

Остаток (по `Backlog.md`): PDF експорт на извештаи, mobile полировка, семантичко пребарување (pgvector embeddings — бара Claude API), SSE наместо polling во UI, Фаза 2 (Meta sync, инсајти, few-shot по резултат), реални SES/Telegram/Meta интеграции.
