# RUNBOOK — GoScriptAI

Што е веќе направено (од развојот) и што останува ти да го направиш.

## ✅ Веќе поставено
- `.env` и `api/.env` создадени; Postgres + Redis кренати преку Docker (`docker compose up -d db redis`).
  - **Порт напомена:** документираниот Postgres порт е `5435`, но на оваа машина го зазема друг проект, па локално е ремапиран на **`5437`** преку `docker-compose.override.yml` (gitignored, per-машина) и `.env`/`api/.env` соодветно покажуваат на `5437`. Redis е на `6383`.
- База мигрирана + seed (3 корисници, 5 агент-темплејти, рубрика, забранети фрази, модел-рутирање, пилот клиент **Алекс Дизајн** + актери Ајтов/Јуле).
- Автоматските тестови поминуваат: `npm test` (64 unit, 100% домен) и `npm run test:integration --workspace api` (54 интеграциски + сигурносни). Порти: `npm run typecheck` · `npm run lint` · `npm run build` — сите зелени.
- **LIVE режим верификуван (Claude Max):** целиот сет-тек мина низ вистински агенти — Creative Director → Writers (fable-5) → Critic (opus) → 2 круга auto-revision во иста сесија → одобрување → **EXPORTED**, со вистински трошок (сет $7.78, 13 CostEntry). Брзи проверки: `AGENT_LIVE=1 tsx --env-file=.env scripts/live-smoke.ts` (евтин SDK тест) и `scripts/live-set.ts` (полн сет на пилотот).

## 🟢 Твои чекори за рачно тестирање (STUB режим — без Claude)

**1. Пушти ги серверите — секој во свој терминал:**
```bash
npm run dev:api      # http://localhost:3001
npm run dev:web      # http://localhost:5182
```

**2. Отвори** `http://localhost:5182` → најави се:
| Улога | Е-маил | Лозинка |
|---|---|---|
| Сценарист | `aleksandar@godigital.mk` | `goscript` |
| Сценарист | `stefan@godigital.mk` | `goscript` |
| Admin (Поставки) | `admin@godigital.mk` | `goscript` |

**3. Помини го текот:** Клиенти → Нов клиент → Пушти анализа → одговори на прашања → одобри профил → одобри аватари → додади актер → Активирај → Нов сет → концепти → Пиши ги избраните → одобри/доработи → Кон експорт → преземи `.docx`.

## 🔵 Ако сакаш ВИСТИНСКИ Claude (LIVE режим)

Само **едно** од двете (клучот и Max login се исклучуваат):

**A) Claude Max:**
```bash
npm i -g @anthropic-ai/claude-code
claude            # внатре: /login   (headless: claude setup-token)
# во .env и api/.env:  AGENT_LIVE=1  и остави ANTHROPIC_API_KEY празно
```
**Б) API клуч:** во `.env` и `api/.env` постави `ANTHROPIC_API_KEY=sk-ant-...` (live се пали сам).

Потоа рестартирај го `dev:api`. Моделите се менуваат од **Поставки → Модели и буџети** (не бара код).

## 📌 Ако нешто не тргне
- Портовите се зафатени? Провери: API `3001`, Web `5182`, Postgres `5437` (локален override; види горе), Redis `6383`.
  - Контејнерите крени ги со `docker compose up -d db redis`; провери со `docker compose ps`. Ако `5435` конфликтира кај друг проект, `docker-compose.override.yml` веќе го држи на `5437`.
- Базата празна? `npm run seed --workspace api` (идемпотентно).
- Детали за архитектура/правила: `CLAUDE.md`. Наоди од аудитот: `AUDIT.md`. План: `ImplementationPlan.md` + `Backlog.md`.
