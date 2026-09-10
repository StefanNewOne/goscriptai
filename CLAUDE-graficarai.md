# CLAUDE.md — GraficarAI

Овој фајл го чита Claude Code на **секоја** сесија. Строго почитувај сè подолу — тоа е столбот на проектот.

**Референтни документи (извор на вистина, по приоритет):**
1. `GraficarAI_PRD_v4.0.md` — PRD v4.0 (composition-first): функција, податоци, фази. **Извор на вистина за функционалност.**
2. `handoff/docs/TEHNICKA_DOKUMENTACIJA.md` — стек, архитектура, модел на податоци, API површина, тестирање, спринтови. **Извор за имплементација.**
3. `GraficarAI_Design_Brief.md` + `handoff/docs/HANDOFF-design.md` — визуелна насока и **конкретни дизајн токени** (hex вредности). **Извор за изглед.**
4. `handoff/prototype/GraficarAI.dc.html` — интерактивен прототип, 7 екрани. **Референца за поведение** (кликај низ него пред UI работа; мокираните делови се излистани во `HANDOFF-design.md §5`).
5. `handoff/spec/` — готови шеми за копирање: `brief-schema.json` (v0.4), `layout-json.example.json`, `tokens.css`, `faza0-parser-output.md`, `acceptance-checklist.md`.
6. `PHASE0_SPIKE.md` — спец за parser spike (мерење на архивата пред полн план).

**Правило при конфликт:** PRD за функција → Design Brief за изглед → `HANDOFF-design.md` за конкретни вредности → прототипот за поведение. Ако прототипот противречи на PRD, **PRD победува** и прототипот е грешка. За неодредено — **застани и прашај**. Не измислувај однесување што не е во спецификацијата.

---

## Проект

GraficarAI е **интерен АИ графичар за GoDigital**: (а) ја претвора 250 GB PSD архива (~80 клиенти, 4.000+ графики) во **пребарлива темплејт-библиотека** од структурирани JSON рецепти, и (б) произведува нови маркетинг графики од бриф + фотографии, кои графичар ги финализира во Layer Editor и извезува во PDF/PNG.

Северна ѕвезда: време по графика **45–90 мин → 10–15 мин**, со ист или подобар визуелен квалитет и **нула грешки во текст**.

Три подсистеми:
1. **Фаза 0 — Ingest** (еднократно, локално): PSD → layer JSON + preview → upload во библиотека.
2. **Библиотека** (VPS): Postgres + pgvector + object storage; рецепти, embeddings, темплејти, style guides.
3. **Производствен пајплајн** (по бриф): агенти → layout JSON → детерминистички рендер → QA → Layer Editor → експорт, со архивирање на резултатот назад во библиотеката (системот учи од сопственото производство).

---

## ЗЛАТНИ ПРАВИЛА — непреговарачки (PRD §2)

Овие се constraint на **секој** дел од системот. Секој PR што ги крши се одбива. Прекршување е bug, не стилска разлика.

1. **Текстот НИКОГАШ не е пиксели од генеративен модел.** Секој текст (headline, цена, CTA, легален ситен текст) се рендерира детерминистички од фонт-фајлови преку рендерерот. Правописна грешка е математички невозможна ако инпутот е точен.
2. **Продукт-пикселите се свети.** Фотографијата на продуктот останува оригинални пиксели. Дозволено: crop, mask, resize, color-match/relight. Генеративни операции (fill, extend, remove) смеат да работат само **ОКОЛУ** продуктот, никогаш врз него — заклучена продукт-маска.
3. **Графиката е JSON, не слика.** Секоја графика е структура од слоеви. Финалната слика е рендер на таа структура. Секоја измена е операција врз JSON, не регенерација на пиксели.
4. **Human-in-the-loop.** Ниедна графика не оди кон клиент без одобрување од човек. QA агентот е филтер, не замена.
5. **Бренд боја/фонт доаѓаат од Client Style Guide, не од меморија на модел.** Модел никогаш не „погодува" hex вредност или фонт. Отсутен фонт = грешка, не substitute.

---

## Stack (НЕ менувај без експлицитна одлука)

- **Frontend:** React 18 + Vite + TypeScript (strict) · Tailwind врз **сопствени токени** во `tokens.css` (никаква default Tailwind палета) · shadcn/ui само за примитиви (dropdown, dialog, tooltip), restyled · `react-i18next` со `mk.json` · Storybook (dark/light) · TanStack Query за server state.
- **Backend:** Node.js 20 + **Fastify** (НЕ Express) + TypeScript · Prisma · BullMQ (Redis) за задачи · Puppeteer (headless Chromium) за рендер.
- **Python 3.11 worker:** `psd-tools` за парсирање, `rembg`/BiRefNet за remove background (детерминистички, CPU, бесплатен).
- **База:** PostgreSQL 16 + pgvector.
- **Инфра:** Docker Compose на Hetzner VPS (предлог CCX23) + Hetzner Storage Box/Object Storage.
- **Надворешни API:** Anthropic (reasoning, копи, QA vision) · fal.ai (generative fill/extend, relight, upscale — модели конфигурабилни **само** преку `ModelRegistry`, никогаш hardcoded).
- **Без GPU сервер.** Сите генеративни операции одат преку API. GPU се разгледува само ако месечниот fal.ai трошок надмине 500 € три месеци по ред (одлука на сопственик).

---

## Структура на репо (monorepo — npm workspaces)

```
graficarai/
├─ CLAUDE.md
├─ docker-compose.yml
├─ apps/
│  ├─ web/                    # React + Vite
│  │  ├─ src/design-system/   # tokens.css, примитиви, Storybook
│  │  ├─ src/screens/         # library · brief · generate · editor · carousel · styleguide · dashboard
│  │  ├─ src/render/          # HTML/CSS рендер на layout JSON (го дели кодот со серверот)
│  │  └─ src/i18n/mk.json
│  ├─ api/                    # Fastify: routes → services → prisma; ai/ за Claude повици
│  └─ worker/                 # BullMQ: render · batch · ingest-upload
├─ services/py-worker/        # psd-tools, rembg; ingest/ (inventory → parse → analyze)
├─ packages/
│  ├─ layout-schema/          # zod + JSON Schema за layout JSON и операциите
│  ├─ render-core/            # компоненти на рендерот (се користат и во web и во puppeteer)
│  └─ shared-types/           # заеднички типови и константи
└─ prisma/schema.prisma
```

**Конвенција на слоеви (backend):** route (тенок: валидира → повика сервис → врати) → service (оркестрација) → prisma. Нема бизнис логика во routes.
**Конвенција на слоеви (frontend):** компонента → hook (TanStack Query) → `lib/api.ts`. Нема бизнис логика во React компоненти.

---

## Јазик и текстови

- **Сите UI strings: македонска кирилица.** Технички термини што индустријата ги користи остануваат англиски каде е природно (PDF, PNG, Layer, upload, dashboard) — но „Поништи" е подобро од „Undo" на копче.
- UI strings во `apps/web/src/i18n/mk.json`, клучеви по екран (`library.filters.client`, `brief.price.missing`, `editor.lock.product`). **НИКОГАШ hardcoded** литерал во JSX. `react-i18next`, `mk.json` е single source.
- Код, коментари, имиња на променливи, commit пораки: **англиски**.
- Датуми во UI: `DD.MM.YYYY`, време 24h. Валута default EUR (API трошоци во EUR).
- ARIA labels и screen-reader текст: на кирилица.
- `error.message` од API што се прикажува на корисник: на македонски, објаснува **што се случило и што да се направи** („Фонтот Playfair Display не е качен за Refan. Качи го во Style Guide за да продолжиш."), никогаш „Настана грешка."

---

## ТВРДИ ИНВАРИЈАНТИ — прекршување е bug

### 1. Детерминистички рендер
Ист `layout JSON` → **пиксел-идентичен** рендер. Покриено со snapshot тестови во CI. Прегледот во Layer Editor мора да е визуелно идентичен со серверскиот Puppeteer рендер — **истите** `render-core` компоненти во двете. Фонтовите се резолвираат **само** од качени фајлови (`.ttf/.otf/.woff2`); отсутен фонт враќа грешка, не substitute (Златно правило 5).

### 2. Двојна верификација на текст
(1) **Детерминистичка** string-по-string споредба `layout JSON ↔ brief JSON` — фаќа 100% од текстуалните отстапувања. (2) **Vision** проверка на рендерот — фаќа рендер проблеми (пресекување, преклопување, контраст). Двете се задолжителни во QA. Цена/датум се споредуваат со **string compare, не vision**.

### 3. verbatim полиња се свети
Полиња обележани `verbatim: true` (цена, попуст, период, код на модел, состав, гаранција, правно тврдење, стручно тврдење) **не смее да ги пишува ниту еден агент** — само човек. Влегуваат во детерминистичкиот string compare во QA и се исклучени од сè што Art Director смее да пишува. Промена на verbatim текст од човек го рекалибрира QA string compare-от и **пишува во `AuditLog` со diff**.

### 4. Заклучени слоеви и продукт-маска
Операција врз `locked: true` слој се **одбива** освен ако слојот не е претходно експлицитно отклучен. Отклучувањето на заштитен слој пишува во `AuditLog` со `diff` и прикажува toast. Причината за заклучување е во `lock_reason` (`PRODUCT_PIXELS_SACRED`, `VERBATIM_FROM_BRIEF`, `BRIEF_PROTECTED`) и во tooltip. Продукт, цена и лого се заклучени **default**. Генеративните операции докажано **не ја допираат** продукт-маската (Златно правило 2).

### 5. Статусите се менуваат само преку контролиран тек
`Brief.status` (`DRAFT|READY|IN_PROGRESS|REVIEW|APPROVED|DELIVERED`) и `Job.status` се менуваат преку сервисен слој што валидира транзиција, проверува RBAC и **пишува `AuditLog`** — никогаш `prisma.brief.update({ data: { status } })` од route. Ниедна графика не станува `APPROVED` без експлицитно човечко одобрување (Златно правило 4).

### 6. Секоја mutation пишува AuditLog
Секоја промена на заштитен елемент — отклучување слој, промена на verbatim текст, промена на style guide, одобрување графика — пишува ред во `AuditLog` со `userId`, `action`, `entity`, `entityId`, `diff`. Тоа е основата при спор и дебагирање.

### 7. Модели се менуваат преку ModelRegistry, не преку код
Секој надворешен image/vision/embed модел се чита од `ModelRegistry` (`purpose`, `provider`, `modelId`, `config`, `active`). Замена на модел е промена на ред во база, **не deploy**. Никогаш hardcoded `modelId` во сервисен код. Пазарот на image модели се менува на ~3 месеци.

### 8. regenerate_bg е изолиран
`regenerate_bg` создава нов `Asset(kind: BG_GENERATED)` и го заменува **само** `asset_id` на позадинскиот слој. Другите слоеви остануваат непроменети. Регенерацијата на позадина не смее да допре ниту еден друг asset.

### 9. Конкурентност преку version
Графиката има `version`. `POST /graphics/:id/ops` со стара верзија враќа **409** и UI прикажува состојба „некој друг ја уредува". Никогаш тивко презапишување.

### 10. NL команда не се применува автоматски
NL команда на македонски → Claude враќа **предлог листа операции** (`{ understood, ops[], clarify }`). Листата се прикажува како чипови и **не се применува автоматски** — второ потврдување ја извршува. Ако confidence е низок или командата е двосмислена, се враќа `clarify` (барање прецизирање), **никогаш претпоставка**.

### 11. Секрети никогаш во репо/клиент/лог
API клучеви само во `.env` на сервер. Никогаш во репо, клиентски bundle, промптови или логови. Anthropic/fal.ai повици само од backend (`apps/api/src/services/ai/`) — **никогаш** API клуч на frontend.

### 12. Пари и лимити
Секој API повик се логира со цена во `Job.costCents`. Цел ≤ **0,35 € по финална графика** (вкл. регенерации). Лимит **5 регенерации по job** со видливо предупредување. Batch API за enrichment (50% пониска цена). Пари како integer cents во `costCents`, не float.

### 13. Границите на архитектурата
- `render-core` е **единствен** извор на рендер компоненти — се дели меѓу web (Layer Editor preview) и Puppeteer (сервер). Дуплирање = bug.
- `layout-schema` е единствен извор на валидација за layout JSON и операции (zod + JSON Schema); frontend форми и backend го делат.
- PSD оригинали **никогаш** не одат на VPS — кон серверот одат само JSON, previews и употребени assets.

---

## Модел на податоци (Prisma — извор: TEHNICKA_DOKUMENTACIJA §4)

```prisma
Client        { id, name, slug, styleGuide Json, active, graphics[], briefs[] }
Graphic       { id, clientId, source ARCHIVE|GENERATED, recipe Json, previewUrl,
                metadata Json, embedding vector(1024), qualityScore Int?, templateId?, createdAt }
Template      { id, name, baseFormat, definition Json, status DRAFT|APPROVED|RETIRED,
                curatedById, usageCount, graphics[] }
Brief         { id, clientId, raw String?, structured Json, schemaVersion String,
                status DRAFT|READY|IN_PROGRESS|REVIEW|APPROVED|DELIVERED, createdById, jobs[] }
Job           { id, briefId, type SINGLE|CAROUSEL, slides Json, selectedTemplateId?,
                layouts Json, renders[], qaResults Json, costCents Int, status }
Asset         { id, clientId?, kind PHOTO_ORIGINAL|PHOTO_PROCESSED|LOGO|FONT|BG_GENERATED, url, hash, meta Json }
User          { id, name, email, role ADMIN|DESIGNER|ACCOUNT|VIEWER }
AuditLog      { id, userId, action, entity, entityId, diff Json, at }
ModelRegistry { id, purpose REASONING|VISION_QA|IMG_EDIT|IMG_BG|EMBED, provider, modelId, config Json, active }
```

Индекси: `Graphic(clientId, source, qualityScore)`, GIN врз `metadata`, HNSW/IVFFlat врз `embedding`, `Template(status, baseFormat)`, `Job(briefId, status)`, `AuditLog(entity, entityId, at)`. Дедупликација: content hash врз рецепт + preview.

Миграции: `npx prisma migrate dev --name descriptive_name` — никогаш рачно менување на applied миграции.

---

## Агент пајплајн (PRD §8, TEHNICKA §7)

| Агент | Модел | Влез → Излез | Гаранција |
|---|---|---|---|
| Brief Analyzer | Claude | суров бриф → structured brief JSON | празни задолжителни полиња = блокирачки warning; **никогаш измислена вредност** (цена/датум/правно) |
| Photo Prep | rembg (локално) + fal.ai | фотки + инструкции → операциска листа → обработени assets | продукт-маска заклучена; генеративно само надвор од маската |
| Retrieval | pgvector | brief JSON + фото метадата → топ 5–10 темплејти | филтер по клиент-стил, формат, број фотки |
| Art Director | Claude | темплејт + бриф + style guide → layout JSON × 3–5 | смее да пишува/скратува копи; **НЕ** смее да менува verbatim полиња |
| Renderer | Puppeteer/canvas | layout JSON → PNG/PDF | пиксел-идентичен рендер за ист JSON |
| QA Agent | Claude vision | рендер + бриф → checklist | fail = flag со причина, **никогаш** автоматска поправка |

Дефолтни модели: избери ги преку `ModelRegistry` (инваријанта 7), никогаш hardcoded. Anthropic Claude — најнов capable модел за секоја намена; провери `claude-api` skill/reference пред да заковаш model id или цени. Prompt caching задолжително за документите што се повторуваат (style guide, темплејт дефиниции). Rate limiting по корисник/клиент (Redis). Секој агентски повик што трае е BullMQ job, не синхроно со HTTP.

**QA checklist v1:** текст комплетен и читлив (контраст ≥ WCAG AA) · цена/датум идентични со бриф (string compare) · ништо важно исечено од safe area · лого присутно и над минимална големина · забранети бои отсутни · фотка без видлива деформација/артефакт.

---

## Шема на брифот (динамична — TEHNICKA §6б)

Брифот **не е фиксна форма**. Полињата се union од: (1) општи, (2) по `content_type`, (3) по клиент (од Style Guide). Целата шема е `handoff/spec/brief-schema.json` (тековна `v0.4`, од примерок 240 графики). Правило за промоција: >60% фреквенција во типот = задолжително · 20–60% = опционално · <20% = оди во `additional_data`.

`Brief.structured` чува `schema_version`; додавање поле не руши стари записи. **По целосниот парс на архивата (Фаза 0), шемата се регенерира од вистинската дистрибуција и се објавува како `v0.5`.** Задолжителните полиња = `union(type_fields, client_fields).filter(req)`; `POST /briefs/:id/jobs` враќа 422 со листа празни задолжителни.

---

## Фаза 0 — Ingest (PRD §6, PHASE0_SPIKE, spec/faza0-parser-output.md)

Се врти **локално** (архивата е локална; кон VPS одат само JSON + previews + употребени assets). Структурирано како `services/py-worker/ingest/` со чисти функции по фаза (`inventory → parse → analyze`), без hardcoded патеки, конфигурација во `ingest.yaml`.

**Парсер (psd-tools):** за секој `.psd` → canvas димензии, flat листа слоеви со `group_path`, bbox, opacity, blend; за текст слоеви и `text`, фамилија/стил/големина/боја/tracking/align, ефекти. Групите се сплескуваат. Растеризиран текст (без text engine data) = `type: "raster_text"`, не се параметризира (само визуелна инспирација, без OCR во v1). Corrupt → `failed/` со причина; цел **<5% failure**. Timeout 120s/фајл. Дедупликација: `md5_file` (точни копии) + `phash` Hamming ≤ 8 (верзии).

**Излез 2 (за шемата на брифот):** за секоја графика извади **кои информациски полиња се присутни** (discount, price, period, cta, product_name, ingredients, warranty…) преку regex + Claude classification врз извлечениот **текст** (не пиксели). Агрегација → фреквенциска табела `content_type × поле` → влез за `brief-schema.json v0.5`.

**Spike прв (PHASE0_SPIKE):** пред полн парс, измери примерок (250–300 PSD од 5 клиенти) и донеси green/yellow/red одлука за темплејт обемот. Spike кодот **не се фрла** — се дораборува во продукцискиот ingest.

**Acceptance:** ≥45/50 случајни парсирани графики точни (позиции ±2%, текст 100%).

---

## Layout JSON и операции (TEHNICKA §9, spec/layout-json.example.json)

Графиката е JSON; секоја измена е операција врз JSON. Операции: `move`, `resize`, `swap_asset`, `rewrite_text`, `regenerate_bg`, `restyle`, `toggle_visibility`, `set_lock`. Секоја носи `{ op, layer_id, ...args, source, actor }`. Undo/redo преку JSON снапшоти, минимум 50 чекори; version history одделна од undo стек. Re-render цел **< 5 секунди**.

---

## Дизајн систем (HANDOFF-design §1, spec/tokens.css)

Токените се во `apps/web/src/design-system/tokens.css` како CSS variables; Tailwind ги консумира. **Dark е default.** Неутрална сива работна површина (`--surface-0: #2E2E2E`, a=b≈0 во Lab) за да се читаат боите на графиките вистинито. Акцент: тил-сина `#4BA3B8` — само за состојба и акција, никогаш декорација. Радиуси: само `4px` (контроли) и `8px` (панели). Елевација = surface стапка + 1px border, **не сенка** (сенка само под modal backdrop). Типографија: **IBM Plex Sans** (кирилица + tabular numerals), IBM Plex Mono само за латинични идентификатори. Скала 12/13/14/16/20/24. Sentence case, без ALL CAPS, без tracking. Мотика само како одговор на акција (120–180ms ease-out); `prefers-reduced-motion` гаси сè.

Тест за секоја визуелна одлука: **„Дали ова ѝ помага на графиката да изгледа вистинито и на графичарот да суди побрзо — или е тука за UI-то да изгледа убаво?"** Ако е второто, се брише.

---

## Конвенции

- **API responses:** `{ data }` или `{ error: { code, message, details? } }`. Error codes `SCREAMING_SNAKE` (`message` на македонски): `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VERSION_CONFLICT` (409), `MISSING_REQUIRED_FIELDS` (422), `FONT_NOT_UPLOADED`, `STYLE_GUIDE_INCOMPLETE`, `LOCKED_LAYER`, `REGEN_LIMIT`, `MODEL_UNAVAILABLE`.
- **Валидација:** Zod на секој endpoint; schemas во `packages/shared-types` / `packages/layout-schema`, споделени со frontend форми.
- **Real-time:** статус на job (фази 1–6) преку SSE/WebSocket (`/jobs/:id/stream`), не polling.
- **Компоненти:** PascalCase, colocated (`Library/Library.tsx` + `useLibrary.ts`). Zustand само за UI state (селекција, филтри, zoom); податоци секогаш низ TanStack Query.
- **Tailwind:** САМО токени од `tokens.css`. Без произволни hex во компоненти. shadcn примитиви restyled — ништо не смее да изгледа „shadcn default".
- **Тестови:** Vitest, colocated `*.test.ts`. `layout-schema` валидација и NL-операција парсер = висок приоритет за покриеност. Snapshot тестови за рендер детерминизам. e2e бриф→експорт со мокирани API одговори.
- **Git:** conventional commits (`feat:`, `fix:`…). Гранка по тикет: `feat/GA-123-library-filters`. Commit/push само на барање.
- **RBAC** (серверски, не UI): `admin` (сè) · `designer` (полн освен админ) · `account` (бриф полн, стартува/одобрува генерирање, останато читање) · `viewer` (read-only, без Layer Editor). Проверено на секој endpoint.

## Домен глосар (кирилица ↔ код)

| Домен (UI) | Код |
|---|---|
| Графика / рецепт | `Graphic` (`source: ARCHIVE\|GENERATED`, `recipe Json`) |
| Темплејт | `Template` (`status: DRAFT\|APPROVED\|RETIRED`, `definition Json`) |
| Бриф | `Brief` (`structured Json`, `schemaVersion`) |
| Задача за генерирање | `Job` (`type: SINGLE\|CAROUSEL`, `layouts Json`, `costCents`) |
| Слот во темплејт | `slot` (background, product, headline, price_badge, cta, logo…) |
| Заклучен / заштитен слој | `locked: true` + `lock_reason` (`PRODUCT_PIXELS_SACRED`\|`VERBATIM_FROM_BRIEF`\|`BRIEF_PROTECTED`) |
| Verbatim поле | `verbatim: true` (не го пишува агент) |
| Client Style Guide | `Client.styleGuide Json` |
| Фото / лого / фонт / генерирана позадина | `Asset` (`kind: PHOTO_ORIGINAL\|PHOTO_PROCESSED\|LOGO\|FONT\|BG_GENERATED`) |
| Операција врз графика | `move`\|`resize`\|`swap_asset`\|`rewrite_text`\|`regenerate_bg`\|`restyle`\|`toggle_visibility`\|`set_lock` |
| Регистар на модели | `ModelRegistry` (`purpose`, `provider`, `modelId`, `active`) |
| Дневник на измени | `AuditLog` (`action`, `entity`, `diff`) |
| Карусел ланец | `Job(type: CAROUSEL)` + `slides Json` + shared style tokens |

---

## Фази и спринтови (PRD §12, TEHNICKA §17)

| Фаза | Недела | Содржина |
|---|---|---|
| **Фаза 0 — Ingest** | 1–3 (паралелно) | parser spike → одлука → полн парс, enrichment, наполнета библиотека, `brief-schema v0.5` |
| **Фаза 1 — Библиотека** | Sprint 1–2 (нед. 1–4) | пребарување (текст+сличност+филтри), преглед рецепти, Style Guide CRUD |
| **Фаза 2 — Генерирање** | Sprint 3–5 (нед. 5–10) | бриф формулар, агент пајплајн, Renderer v1, куририрање темплејти, QA, PDF/PNG. **MVP: прва реална клиентска графика end-to-end** |
| **Фаза 3 — Layer Editor** | Sprint 6–7 (нед. 11–14) | кликабилен canvas, директни контроли, NL команди, undo/version history |
| **Фаза 4 — Фото + Карусели** | Sprint 8–9 (нед. 15–18) | fal.ai операции, генеративни позадини, relight, chain planner, batch |

**Редослед на фронтенд градење:** токени + примитиви → Библиотека → Layer Editor → Генерирање → Бриф → Style Guide → Карусел → Dashboard.

---

## Работен процес на Claude Code сесии

1. Прочитај го тикетот + релевантната секција од PRD / TEHNICKA **пред** код.
2. Редослед по функционалност: типови/Zod schemas (`packages/`) → backend service + тест → route → frontend hook → компонента.
3. По секоја функционалност: `npm run typecheck && npm run test && npm run lint` — **мора зелено** пред commit.
4. **Не воведувај нови dependencies без прашање.**
5. Миграции преку `prisma migrate dev` — никогаш рачно менување на applied миграции.
6. Ако задачата бара да заобиколиш златно правило или тврда инваријанта — **застани и прашај.** Тоа е знак дека нешто во спецификацијата не е дорешено.

## Отворени одлуки (блокираат делови од полн план — TEHNICKA §19)

1. Автентикација: агенциски SSO или локални сметки?
2. Кој графичар е owner на куририрањето темплејти (25% алокација)?
3. Потврда на пилот клиентите (предлог: Refan, Doors Impeks, LL Gourmet).
4. Free-text бриф преку Viber-пејст — must-have за v1 или формуларот е доволен?
5. Останува името „GraficarAI" или ново во GoDigital OS фамилијата?
6. CCX23 нов или постоечки VPS?
