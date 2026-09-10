# Handoff: GoScriptAI — agentic reel-script system (Ф0 + Ф1)

## Overview
GoScriptAI is an internal tool for two scriptwriters/directors (Александар, Стефан) at GoDigital. Per client it maintains a "Client Brain" (profile, buyer avatars, products, actors, locations, competitors, trend references, glossary), and on top of that brain the writer runs a **set**: brief → concepts → scripts → critique → approval → export. Background agents do the mechanics; the human owns every decision. Every script gets a code (`ALEKS-2609-03`) that **is** the ad name in Meta Ads Manager, so results can flow back in Phase 2.

UI language is Macedonian Cyrillic. Code, component names and identifiers are English.

## About the Design Files
The files in this bundle are **design references created in HTML** — a streaming prototype showing intended look, copy and behavior. They are **not production code to copy**. The task is to recreate these designs in the target codebase's environment using its established patterns. The PRD specifies **React + Vite + Tailwind (SPA)** with a Node 22 + Fastify + Prisma/Postgres backend; if that app does not exist yet, scaffold it per PRD §6 and implement these screens there.

The prototype is a single component with mocked data and simulated agent timings (`setTimeout`). In production every agent phase is a BullMQ job with SSE status; the UI never blocks.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, density, copy and interaction behavior. Recreate pixel-close using the tokens below. All fourteen screens of Design Brief §7 are built. The one deliberately unfinished area: actor and location photos are striped placeholders (the client has not supplied photography yet). Резултати shows Phase-2 shaped data with representative numbers — wire it to the real Meta sync before trusting any figure.

## Design Tokens

### Color (from Design Brief §4.2 — do not substitute)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F6F4` | app background (cool neutral, never cream) |
| `sheet` | `#FFFFFF` | reading surfaces: script, cards, profile, tables |
| `ink` | `#1B1F24` | primary text, primary dark buttons |
| `ink-2` | `#5A6270` | secondary text, stage directions in script |
| `rule` | `#D9DDE3` | 1px borders and dividers (no shadows) |
| `signal` | `#E4572E` | **only** "waiting for you": checkpoint badges, Одобри / Пиши ги избраните / Испрати, Inbox counter |
| `ok` | `#2F7D4F` | approved, passed critique, confirmed |
| `hold` | `#B7791F` | BUDGET_HOLD, pending confirmation, failed critique |
| `fail` | `#9B2C2C` | FAILED, error, banned glossary term |

Hover shades used: dark button hover `#2b3038`; signal button hover `#cf4b25`; row hover `#F8F9F7`; nav item hover `#ECEEEB`; active nav background `#E6E8E4`; selected/active chip background `#F5F6F4`; frame highlight after "скокни до кадар" `#FBE9E3`.

Absolute rule: `signal` appears **nowhere** except where a human must decide. A fully approved set screen is effectively black and white.

No dark theme in v1 (writers read text for hours; light paper is a deliberate choice).

### Typography
- **IBM Plex Sans** 400 / 500 / 600 — entire interface. No 300, no 700+.
- **IBM Plex Mono** 400 / 600 / 400-italic — script text only (directions, lines, on-screen tables) and script codes.
- Scale (desktop): 13 / 14 / 16 / 20 / 28 px. Body 14px, line-height 1.5. Reading document (profile) 16px / 1.55. Script 16px mono / line-height 1.7 / max 68 characters.
- Headings in sentence case.
- Forbidden: ALL-CAPS labels, tracked-out eyebrows, middle dots (·) joining metadata **in titles** (metadata is separated by space + 1px rule), arrows "→" on buttons.
- Exception: frame roles **ХООК / БОДИ / ЦТА** are uppercase — a domain convention from the agency's real scripts.
- Cyrillic must be tested with Ѓ Ќ Ѕ Џ Љ Њ and Albanian Ç Ë in all weights.

### Layout, spacing, radii
- Left nav fixed **240px** (icon + word), sticky full height. Content max-width **1280px**, left-aligned, padding 24px. No centered hero blocks.
- Top bar 56px, sticky: search field (max 520px), spacer, "Нов сет" (dark).
- Detail screens are two columns: 65% work surface / 35% context. On the script screen: list 200–230px · script `1fr` (min 460px) · context 280–320px collapsible.
- Borders `rule` 1px. Radius **6px** for controls, **10px** for sheets/cards. Pill radius 16px for chips, 10–12px for badges.
- Shadows only on floating elements: `0 8px 24px rgba(27,31,36,.10–.20)` (sticky checkpoint bar, search dropdown, toast).
- Density is workmanlike, not airy: table/list rows min 44px desktop (52px for rows with logo/avatar), 52px mobile. Gaps 16–20px between sections, 6–10px inside cards.

### Motion
One orchestrated movement: when an agent finishes and something new waits for you, the Inbox badge pulses **once** to `signal` (`@keyframes gs-pulse`, 0.8s, box-shadow ring). Nothing else animates on its own. Responses to action are 150–200ms. `prefers-reduced-motion: reduce` disables all animation and transition.

## Screens / Views

### 1. Чека тебе (Inbox) — start page, route `/`
Purpose: answer "what is waiting for me?" in the first second, across all clients and sets.

Layout: h1 28/600 + summary text + spacer + "Само мои" checkbox. Then groups, gap 24px, in fixed order: **Концепти за избор · Сценарија за одобрување · Предлози за потврда · Буџет** (also planned: Прашања од анализа, Немапирани реклами Ф2). Group header 14/500 + count in `ink-2` 13px. Each group is a white 10px card, rows separated by 1px `rule` (rows use `border-top` + `margin-top:-1px` so the card edge stays clean).

Row grid: `36px 1fr 1.4fr 100px 110px`, gap 16px, min-height 52px, padding 8px 16px, hover `#F8F9F7`.
1. Client logo 36×36 `object-fit:contain`, 1px `rule`, radius 6px, 3px padding — or a monogram box when no logo.
2. Client name (500) над set name (13px `ink-2`, ellipsis).
3. 8px `signal` dot + what is waiting.
4. "чека 3 ч" (13px `ink-2`).
5. Writer name, right-aligned, 13px `ink-2`.

Row click deep-links to the **decision screen**, not an overview.

Empty state: white card, max 560px, "Ништо не чека. Агентите работат на 3 сета." + secondary button "Отвори клиенти".

### 2. Клиенти, route `/clients`
Header: h1 + "4 активни, сортирани по чекање" + "Нов клиент" (secondary).
Table card, header row 13px `ink-2`, columns `36px 1.4fr 70px 1.2fr 110px 1fr 110px`: logo · name + industry · language · brain status (colored dot + text; `ok` complete, `hold` "недостасува X") · sets this month vs contract ("6 од 12") · **avatar coverage** · waiting badge.

Avatar coverage: one group of bars per avatar, gap 6px between groups, 2px between bars; each bar 5×14px radius 1px; `ink` = targeted in that set, `rule` = not. Four grey bars means "uncovered 3+ sets".

Waiting badge: `signal` pill, height 24px, white 13/500 text "Чека тебе 2".

### 3. Клиент — Преглед, route `/clients/:id`
Header: logo (44px tall, max 180px) · h1 name · mono code 13px `ink-2` · meta row (language | contract | month budget, separated by 1px left rules) · "Нов сет" dark 40px.
Tabs (Преглед · Мозок на клиентот · Сетови): 40px tall, 2px bottom border `ink` when active, `ink-2` label when not.

Body grid `1.3fr 1fr`, gap 20px:
- **Што е ново** (read first): card, rows `48px 90px 1fr` — date · kind · text.
- **Покриеност на аватари**: rows `1fr 60px 80px 90px` — name · bars 10×16px · "11 сцен." · last set (`hold` colored when uncovered 3+).
- **Сетови**: rows with name + mono code + count + writer, and a status dot + label.

### 4. Клиент — Мозок, route `/clients/:id/brain/:tab`
Left sub-nav 200px, 36px rows, active background `#E6E8E4` + 600 weight. Tabs: Профил · Аватари · Продукти · Актери · Локации · Конкуренти · Референци · Речник · Инсајти.

- **Профил** — reading document, white card padding 32/40, `max-width:760px`, h2 20/600 + paragraphs 16/1.55 capped at 68ch. Above it: "Профил v3 · одобрен 28.08.2026" + "Верзии и разлики" (toggles a DiffView panel: version list + mono diff lines with `+` `ok`, `−` `fail`, `~` `ink-2`) + "Ажурирај анализа".
- **Аватари** — `AvatarCard` grid `minmax(300px,1fr)`: name 16/600, status right (`ok` потврден / `hold` чека потврда / `ink-2` пензиониран), one-line "who", then a `dl` grid `96px 1fr` 13px: Болка · Желба · Зошто купува · Приговори · Како зборува · Продукти; footer with coverage bars + "11 сценарија · последно Сет 2609".
- **Продукти** — inline-editable table, columns `2fr 1fr 1fr 1fr 1.2fr 70px`. Inputs are borderless until hover (`rule`) / focus (`ink` + white background); price and rate in mono 13px. Optimistic update, rollback on 4xx.
- **Актери** — `PersonCard`, grid `120px 1fr`: photo column (striped placeholder, min-height 200px) + name 20/600, role · languages, `dl` 72px: Стил · Може · Не може · Забрани, footer script count. Visually warmer than tables but same palette.
- **Локации** — `PlaceCard`: 120px image placeholder on top, name 16/600, description, `dl`: Се користи · Ограничувања.
- **Конкуренти** — agent proposals in a **separate** block above, marked with a `signal` dot, each with Отфрли (secondary) / Потврди (`signal`); confirmed competitors below in a plain table with a status dot.
- **Референци** — rows `100px 1.2fr 110px 2fr`: platform · mono link · flag pill (Инспирација / Не копирај) · note.
- **Речник** — table `60px 1.3fr 2fr 140px`: language · term · meaning · kind, kind colored (`ok` претпочитан, `fail` забранет, `ink-2` име на производ).
- **Инсајти** — empty state: comes with Phase 2 ad results.

### 5. Нов сет — Бриф, route `/sets/new?client=`
One screen, `max-width:760px`, vertical stack of white cards, gap 20px. No wizard steps — a writer fills it in three minutes.
1. Client row + collapsible `<details>` "Што е ново од последниот сет".
2. Number of scripts: `− N +` stepper (36px cells, dividers `rule`), plus "Креативниот директор предлага 8 концепти."
3. Type chips (Продажно · Едукативно · Тестимонијал · Скеч · Одлучи ти): 32px pills, active = `ink` fill + white text.
4. Product select (max 420px) + free-text offer field.
5. Avatars: checkbox cards grid `minmax(210px,1fr)`; 18px checkbox square, name + "предлог" pill for system suggestions + one-line who + coverage bars.
6. Actors and locations: two columns of checkbox rows with 40px photo placeholders (circle for actors, 6px radius for locations), plus dashed "+ нов актер".
7. Notes textarea, 8. Inspiration input + radio "Преработи за клиентот" / "Ова не", 9. Constraints input + duration select.
Footer: "Генерирај концепти" (dark, 44px, 15px/500) + live summary "4 сценарија · 2 аватари · 2 актери · ~30 сек".

On submit: `POST /api/sets` then enqueue the Creative Director job; navigate to the set with status "Се генерираат концепти"; **the user is free to leave immediately**.

### 6. Сет — Концепти (checkpoint 1), route `/sets/:id/concepts`
Set header: client breadcrumb (logo 24px + name, hover `ink`) / h1 20/600 set name / mono code / status pill (dot + label in a white 12px-radius pill) / spacer / "writer · date". Tabs: Бриф · Концепти · Сценарија · Транскрипти · Трошок · Експорт, with an 8px `signal` dot on tabs that hold a decision.

Generating state: white card max 560px — "Се генерираат концепти", 3px progress line (`ink` on `#ECEEEB`), and the explicit permission "Можеш да продолжиш со друга работа — ќе се појави во „Чека тебе“."

Ready state: grid `1fr 260px`. Cards grid `minmax(330px,1fr)`, gap 14px. `ConceptCard` (padding 16px, gap 10px):
- meta row 13px: type pill · avatar name · optional `hold` "непокриен аватар" · mono `~30s` right.
- **hook 20/600 line-height 1.25** — the biggest text on the card; the decision is made on it.
- insight 14px `ink-2`; then "Актер X · Локација Y" 13px; then a top-ruled "Зошто треба да работи: …" 13px.
- optional saved comment block (`paper` background), optional inline comment input.
- actions (wrap): Избери (toggles to `ink` fill + "Избрано") · Отфрли (card drops to 0.45 opacity, label becomes "Врати") · Коментар · Смени аватар.
Right rail (sticky, top 80px): "Избрани 4 од 5 барани" 20/600, contextual hint, "Уште 3 карти во оваа насока" (disabled until something is selected; shows its own progress line), and the only `signal` button: **"Пиши ги избраните"** 44px/600. Rejected cards stay in the set as a "no" for next time.

For an already-decided/archived set the tab shows a read-only summary card with a link to Сценарија.

### 7. Сет — Сценарија (checkpoint 2) — hero screen, route `/sets/:id/scripts/:scriptId`
Three columns, flex-wrap: **list 200–230px** (sticky) · **script `1fr` min 460px** · **context 280–320px** (sticky, collapsible to a 36px `‹` button). Below ~1000px the columns wrap vertically instead of overlapping — the script keeps full width.

Optional top line while writing: `AgentStatusLine` — "Се пишуваат 5 · 2 готови" + a 160×3px progress line. No spinner, ever.

List item: mono 12px index + title (500, ellipsis) + status dot & label 13px; the current one gets a white background + `rule` border.

**ScriptView** (white card, radius 10px, padding 32px / clamp(16px,4%,40px) / 120px bottom):
- optional `hold` pill "Не помина критика по 2 круга · 3 наоди".
- mono 13px `ink-2` "СЦЕНАРИО 02", then h2 **mono** 20/600 title.
- meta row 13px `ink-2`, items separated by 1px left rules: type | avatar | actor | location | ~40 сек | **mono code in `ink`** | "верзија 2" right. Closed by a 1px rule.
- frames, gap 26px, each `section id="frame-N"` grid `minmax(90px,110px) minmax(0,68ch)`, gap 16px, `scroll-margin-top:90px`:
  - margin column: role **ХООК/БОДИ/ЦТА** 13px/600 `ink`, "Кадар 2" `ink-2`, optional italic sub-label.
  - body column, mono 16/1.7: direction as *italic* `ink-2` paragraph; optional on-screen table (13–14px, header `border-bottom:1px solid ink`, rows `rule`, `white-space:nowrap`); lines as "**Ајтов:** „…“"; optional "Монтажа: …" 14px with a 2px left `rule`.
- collapsible "Верзии (3)" history: `v3 | Писател · ревизија 2 | 03.09 · 10:20`.

**CheckpointBar** — sticky bottom 16px inside the card, white, `rule`, radius 10px, shadow, the only place with a `signal` button:
- **Одобри** (`signal`, 40px, 15px/600) → `POST /api/scripts/:id/approve`, toast "Одобрено", auto-advance to the next script that waits.
- **Доработи рачно** → `ScriptEditor`: the same typography becomes editable in place (per-field `contentEditable`, actor names non-editable); an explanatory line appears; "Зачувај верзија 3" reads the edited fields back and creates a new version; "Откажи" discards.
- **Врати со коментар** → textarea (3 rows) + "Испрати" (`signal`, disabled while empty). Writer continues in the same session; the script returns to "Чека тебе" as a new version.
Approved scripts instead show an `ok` status bar with "Доработи рачно" and, when the whole set is approved, "Кон експорт".

**ContextSheet** (right; on mobile a draggable bottom sheet), two tabs:
- **Критика** — total "89%" 20/600 + verdict (`ok` поминува / `hold` под прагот); then 11 criteria rows `1fr 64px 14px`: name (turns `hold` when < 3) · 5 pips 10×8px · score. Then "Наоди на Критичарот" with each finding's text and an underlined "Скокни до кадар 3" that scrolls to `#frame-N` and highlights it `#FBE9E3` for ~1.6s.
- **Контекст** — small bordered cards: avatar (name + who + pain), actor (44px photo + style + "Не може"), location (limits), product in focus.

Threshold rule: all criteria ≥ 3 **and** total ≥ 80%. Below → back to the Writer in the same session, max 2 rounds, then `CRITIC_FAILED` shown with findings (the writer may still approve).

### 8. Сет — Експорт, route `/sets/:id/export`
Blocked state until every script is `APPROVED`: card with "Одобрени 2 од 3." + link back.
Ready: grid `1fr 300px`. Left is a **mono document preview** (padding 32/40): title "Алекс Дизајн Септември 2026 Сценарија" 20/600, sub "3 сценарија · ALEKS-2609 · Александар", then one block per script separated by 1px rules: **code 20/600** + "Копирај код" (28px secondary, sans) + "СЦЕНАРИО 01 — Наслов" + meta line + "4 кадри · 74 зборови изговорен текст".
Right rail: "Актери и локации" list; "Експортирај документ" (dark 44px) → progress line → an `ok` card with `.docx` and `.md` links. Set becomes `EXPORTED`.

The code is the ad name in Ads Manager — it must be copyable in one click and shown large.

### 9. Сет — Транскрипти / Трошок
Транскрипти: run tabs (mono 12px, 30px), then a dense monochrome `TranscriptViewer` — mono 13px rows `90px 1fr`, role · text; tool calls collapsed and `nowrap`; live via SSE. Built for inspection, not daily work; model names are allowed here and in Settings only.
Трошок: "$4,12" 28/600 + "од буџет $8 за сетот", a 4px progress bar, then a table per agent (`1fr 100px 100px`, cost mono right-aligned), and the rule: warning at 80%, `BUDGET_HOLD` at 100%.

### 10. Сценарија — база, route `/scripts`
One search field (code, title, hook, or meaning — semantic search shares the same input, no separate "AI search" UI) + type/star chips. Table `140px 1.2fr 2fr 130px 90px 130px`: mono code (+ a small rotated square for star examples) · title · hook (ellipsis) · client · date · status. Click opens the same read-only `ScriptView`.

### 11. Резултати (Phase 2), route `/results`
Header + the framing line "Перцентилот е споредба со медијаната на истиот клиент, не меѓу клиенти." (13px `ink-2`, 68ch).

**Немапирани реклами** first, marked with a `signal` dot — it is a checkpoint: rows `1.4fr 1.2fr 100px 110px 240px` (mono ad name · ad account · spend · start date · actions), actions = script `<select>` + **Мапирај** (`signal`, disabled until a script is picked) + **Не е наше** (secondary). Both actions remove the row with a toast.

Then Сите / Топ / Дно chips, and the per-script table, columns `130px 1.2fr 110px 100px 1fr 110px 70px 70px 90px`: mono code (+ star diamond) · title · objective (`THRUPLAY`/`MESSAGES`/…) · spend · results · cost per result (mono) · hook rate · hold rate · **percentile** as a 6px bar (`ok` ≥ 70, `ink-2` ≥ 40, `hold` below) + the number.

Below: two cards **По аватар** and **По тип**, rows `1.2fr 1fr 90px` — name (600 for the best performer) · 8px horizontal share bar (`ok` for the best, `ink` otherwise) + percentage · cost per result. Horizontal bars only — no pies, no line charts (brief §11).

### 12. Увоз, route `/import`
Four states: **idle → parsing → parsed → saved**.
- idle: three mode cards (`minmax(240px,1fr)`) — Вметни текст · Качи docx · Повеќе фајлови, each with a one-line hint; the picked one gets an `ink` border. Text mode opens a mono textarea (10 rows) + **Парсирај** (disabled while empty) + Вметни пример.
- parsing: card with a 3px progress line and "Се читаат кадри, режија и реплики…".
- parsed: a `hold`-bordered warnings card (rows `90px 1fr`, e.g. "Не најдов кадар со улога ЦТА"), then a two-column comparison: **left** the normalized result in the same mono screenplay rendering as `ScriptView` (margin column `96px`, role + frame number, italic direction, actor line), **right** the original text in a `<pre>` (13px, `ink-2`, `white-space:pre-wrap`). Below, a field row (`minmax(190px,1fr)` auto-fit): Клиент · Код (mono) · Тип · Аватар · Актер · Датум на реклама · Ѕвезда пример checkbox. Footer: **Прифати и зачувај** (dark 44px) · Откажи · the reminder that the code must equal the ad name.
- saved: `ok` confirmation with the code and two buttons (Увези уште едно / Отвори базата).

The prototype's parser is real: it splits on blank lines, keeps blocks containing "КАДАР", lifts the parenthetical as the direction, assigns ХООК to the first frame and ЦТА to the last. Production parsing happens server-side (`POST /api/import/parse`) and must handle docx + multi-file batches, duplicate codes (offer the next free `NN`) and frames with no role (manual assignment before commit).

### 13. Извештаи, route `/reports`
Tabs Месечно · По клиент · По сет, and "Експортирај PDF" in the header.
- Месечно: columns `1.2fr 80px 90px 110px 110px 110px 130px` — month · sets · scripts · sets by Александар · by Стефан · cost (mono) · API fallback (mono, `hold` when non-zero), with the note that cost is covered by the Max subscription.
- По клиент: sets done vs contract with an 8px fulfilment bar (`ok` ≥ 50%, else `hold`) and monthly spend.
- По сет: mono code · set · scripts · writer · cost · status dot.

### 14. Поставки (Admin only), route `/settings/:tab`
Left sub-nav (190–220px) with six tabs; content column `1fr` min 520px.
- **Темплејти на агенти** — agent chips (Креативен директор, Писател, Критичар, Клиент-анализа, Аватари); header "верзија 6 · ажурирана 02.09.2026" + Историја; the system prompt in a mono textarea (14 rows); "Зачувај верзија 7" is disabled until the text changes. Prompts map to `Template{kind, version, content, active}`.
- **Рубрика на Критичарот** — the 11 criteria as an editable table (name inline-editable, minimum score 2/3/4, active toggle) + "+ нов критериум" and the threshold rule.
- **Забранети фрази** — one card per language, phrases as removable 30px pills + "+ фраза".
- **Формат на сценарио** — the PRD §11 template shown as mono `<pre>` plus the normalization rules.
- **Модели и буџети** — per-agent routing table (model, fallback, budget per run), then auth (Max + automatic API-key fallback with notification), per-client budget ($50, warn at 80%), per-set budget ($8, `BUDGET_HOLD` at 100%), and a **masked Meta token** with Покажи/Скриј.
- **Корисници и улоги** — name, mono email, role select (Сценарист / Admin / Viewer), notification channels, plus the list of notification events.

Model names appear **only** here and in Транскрипти — never in the main flow.

## Interactions & Behavior
- Global search (top bar) filters clients and scripts live and shows a dropdown (`rule` card, 8px shadow); clicking a result deep-links.
- Nav badge counts everything waiting; pulses once on new arrivals.
- Concept selection is optimistic and reversible; "Уште 3 карти" runs in the same agent session using the selected card as reference.
- "Пиши ги избраните" fans out one Writer job per selected concept in parallel; the UI shows per-script status transitions се пишува → во критика → чека тебе, and pulses the badge when the last one lands.
- Approve auto-advances to the next waiting script; when none remain, "Кон експорт" appears.
- Manual edit persists per field and always creates a version; the previous version stays in history.
- Return-with-comment moves the script to "Се доработува", then back to "Чека тебе" with an incremented version and cleared findings.
- Toasts appear bottom-center, `ink` background, 2.6s.
- Confirm dialogs are required for destructive actions (reject a proposal, delete).
- All transitions are 150–200ms; `prefers-reduced-motion` disables them.

## State Management
Prototype state (map these to server state + React Query / SWR in production):
`screen`, `clientId`, `clientTab`, `brainTab`, `setId`, `setTab`, `scriptId`, `ctxOpen`, `ctxTab`, `editing`, `returning`, `comment`, `onlyMine`, `search`, `baseQuery`, `baseFilter`, `runTab`, `showDiff`, `highlightFrame`, `toast`, `pulse`, plus collections `sets`, `scripts`, `concepts`, `proposals` and the `brief` form object.

Server-side transitions (authoritative):
- Client: `DRAFT → INTAKE → ANALYST_RUNNING → ANALYST_QUESTIONS* → ANALYST_REVIEW* → AVATARS_RUNNING → AVATARS_REVIEW* → MANUAL_SETUP* → ACTIVE`
- Set: `DRAFT → BRIEF_SUBMITTED → CONCEPTS_GENERATING → CONCEPTS_REVIEW* → SCRIPTS_WRITING → CRITIC_RUNNING → (AUTO_REVISION ≤2) → SCRIPTS_REVIEW* ↔ REVISION → APPROVED → EXPORTED → [Ф2] LINKED_TO_ADS → LEARNED → ARCHIVED`; special: `PAUSED`, `FAILED` (after 3 retries), `BUDGET_HOLD`. `*` = human checkpoint.
- Every agent phase is a BullMQ job; status arrives by SSE. No agent writes a new entity outside `PENDING_CONFIRMATION`.

Data fetching endpoints, request/response shapes, models and per-screen edge cases are documented per screen in **Техничка документација.dc.html** (bundled).

## Assets
- `assets/aleks-logo.webp` — client logo, supplied by the user.
- Actor and location photos: **striped SVG-gradient placeholders** with mono captions ("фото Ајтов", "слика Салон Радишани"). Replace with real photography; the brief requires real faces, not icons.
- Fonts: IBM Plex Sans + IBM Plex Mono from Google Fonts (self-host in production).
- Script content in `data.js` is the agency's real material from "Алекс Дизајн Август Сценариа.docx" — no lorem ipsum anywhere. Keep the wording verbatim when seeding fixtures.

## Files
| File | What it is |
|---|---|
`GoScriptAI.dc.html` | the full interactive prototype (all screens, states and flows) |
`data.js` | all fixture data: clients, avatars, products, actors, locations, competitors, references, glossary, what's-new, profile, rubric, concepts, scripts, sets, transcript, costs, ad results, unmapped ads, avatar/type reports, import sample, agent templates, banned phrases, model routing, users, monthly report |
`support.js` | runtime for the prototype format — **not** part of the production app |
`Упатство за сценарист.dc.html` | end-user guide in Macedonian, screen by screen (printable) |
`Техничка документација.dc.html` | per-screen technical spec: routes, APIs, models, agents, transitions, edge cases, acceptance criteria (printable) |
`doc-page.js` | runtime for those two printable documents |
`specs/GoScriptAI_PRD_v1_0.md` | product requirements (source of truth for the data model and agents) |
`specs/GoScriptAI_Design_Brief_v1_0.md` | design brief (source of truth for tokens, screens and prohibitions) |
`assets/aleks-logo.webp` | client logo |

## Explicit prohibitions (from the brief — please honor them)
No cream background with terracotta accent; no dark theme with neon accent; no "SaaS kit" identical cards with grey shadows. No spinners, no "thinking…" animations, no gradient backgrounds, no robot/brain illustrations. No chat interface for working with the agents — free text goes to an agent only in the brief and in "Врати со коментар". No charts for the sake of charts (Phase 1 has none; Phase 2 only horizontal bars and one timeline). No English terms in the UI except codes, model names in Settings, and technical logs. Agent and model names never appear in the main flow ("Се пишуваат сценарија", not "Writer Agent is running").

## Acceptance criterion
A writer with no instruction opens Inbox, understands what waits, opens a set, reads a script on screen the way they would read it on paper before a shoot, approves with one button, and knows where the client's document is. If any of those steps needs explaining, the implementation is not done.
