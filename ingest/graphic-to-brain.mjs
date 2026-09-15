// Local ingestion: graphics -> Brain via Gemini.
// Reads a folder of client graphics (ad creatives, banners, offer cards),
// asks Gemini what's really on them, and pushes PROPOSALS into GoScriptAI:
//   • products/offers  → Продукти (confirmed=false)
//   • slogans/taglines → Речник PREFERRED (confirmed=false)
// Everything waits for the scriptwriter to confirm (invariant 2). Catalog↔
// mentions stays intact: what a graphic says is a proposal, essence > price.
//
//   cd ingest
//   npm run graphics -- "C:\\...\\graphics\\GODIGITAL" --client=GODIGITAL
//   npm run graphics -- "C:\\...\\graphics\\GODIGITAL" --dry     (no push, print only)
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(m) {
  console.error('❌ ' + m);
  process.exit(1);
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message ?? e);
      const retryable =
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded') || msg.includes('500');
      const dailyQuota = /per\s*day/i.test(msg) || msg.includes('PerDay');
      if (!retryable || dailyQuota || attempt >= 6) throw e;
      const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":\s*"(\d+)s"/);
      const delay = m ? Math.ceil(parseFloat(m[1])) + 1 : Math.min(60, 2 ** attempt * 5);
      console.log(`   ⏳ лимит (429) — чекам ${delay}s па пробувам пак…`);
      await sleep(delay * 1000);
    }
  }
}

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((a) => a.startsWith('--'));
const folder = rawArgs.find((a) => !a.startsWith('--'));
const dry = flags.includes('--dry');
const clientCode = flags.find((a) => a.startsWith('--client='))?.split('=')[1] ?? null;

if (!folder) fail('Патека до фолдер со графики недостасува.\n   Пример: npm run graphics -- "C:\\...\\graphics\\GODIGITAL" --client=GODIGITAL');
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) fail(`Фолдерот не постои: ${folder}`);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) fail('GEMINI_API_KEY недостасува во .env.');
const models = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.6-flash').split(',').map((s) => s.trim()).filter(Boolean);
let modelIdx = 0;
const ai = new GoogleGenAI({ apiKey });

const PROMPT =
  'Ти е дадена ГРАФИКА (рекламен креатив/банер/понуда/едукативна објава) на бизнис. Извлечи САМО што реално се гледа на неа — не измислувај. Врати САМО валиден JSON:\n' +
  '{"products":[{"name":"","category":"","price":0,"essence":"што е и зошто е важно; вклучи ја понудата/попустот како текст"}],' +
  '"slogans":["точен слоган/таглајн/порака напишана на графиката"],' +
  '"brandNotes":"кратко за визуелниот тон и стил (боја, расположение, што повторува)"}\n' +
  'Правила: products е САМО вистински ПРОИЗВОД/УСЛУГА/ПОНУДА што се рекламира за КУПУВАЊЕ (име, цена, попуст, „нарачај/купи"). Едукативна или брендинг содржина (совети, „5 причини…", честитки, топ-листи, мотивација) НЕ Е продукт — за неа врати products:[] и стави ја пораката во slogans. price е број САМО ако јасно е испишана цена. slogans се дословни текстови од графиката (кратки пораки/таглајни/наслови), не описи. Ако нешто го нема, врати празна низа. Пиши на македонски.';

const files = fs.readdirSync(folder).filter((f) => MIME[path.extname(f).toLowerCase()]).sort();
if (files.length === 0) fail('Нема графики во фолдерот (jpg/png/webp/gif).');
console.log(`Модели: ${models.join(', ')}\nГрафики: ${files.length}\n`);

function parseJson(text) {
  if (!text) throw new Error('Празен одговор од моделот.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Одговорот не е валиден JSON.');
  return JSON.parse(body.slice(start, end + 1));
}

// Aggregate across all graphics, deduping products by name and slogans by text.
const productsByName = new Map();
const slogans = new Set();
const brandNotes = [];
let done = 0;
let failed = 0;
let exhausted = false; // all models hit the per-day free-tier quota

for (const name of files) {
  const ext = path.extname(name).toLowerCase();
  const full = path.join(folder, name);
  try {
    const data = fs.readFileSync(full).toString('base64');
    let response;
    for (;;) {
      console.log(`▶  ${name} — читам со ${models[modelIdx]}…`);
      try {
        response = await withRetry(() =>
          ai.models.generateContent({
            model: models[modelIdx],
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: MIME[ext], data } }, { text: PROMPT }] }],
            config: { responseMimeType: 'application/json' },
          }),
        );
        break;
      } catch (e) {
        const msg = String(e?.message ?? e);
        const daily = /per\s*day/i.test(msg) || msg.includes('PerDay');
        if (daily && modelIdx < models.length - 1) {
          modelIdx++;
          console.log(`   ↪ дневен лимит — префрлам на ${models[modelIdx]}`);
          continue;
        }
        // Last model also hit its per-day quota — stop; retrying won't help today.
        if (daily) exhausted = true;
        throw e;
      }
    }
    const parsed = parseJson(response.text);
    for (const p of parsed.products ?? []) {
      if (!p?.name) continue;
      const key = String(p.name).trim().toLowerCase();
      if (!productsByName.has(key)) {
        productsByName.set(key, {
          name: String(p.name).trim(),
          category: p.category || undefined,
          price: p.price ? Number(p.price) : undefined,
          essence: p.essence || undefined,
        });
      }
    }
    for (const s of parsed.slogans ?? []) {
      const t = String(s ?? '').trim();
      if (t) slogans.add(t);
    }
    if (parsed.brandNotes) brandNotes.push(String(parsed.brandNotes).trim());
    done++;
    console.log(`   ✓ продукти: ${(parsed.products ?? []).length} · слогани: ${(parsed.slogans ?? []).length}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e?.message ?? e}`);
    if (exhausted) {
      console.log('\n⛔ Сите модели ја удрија ДНЕВНАТА бесплатна квота (20/модел). Застанувам.');
      console.log('   Пробај утре (квотата се ресетира) или вклучи billing на Gemini за без лимит.');
      break;
    }
  }
}

const products = [...productsByName.values()];
const sloganList = [...slogans];
const payload = { products, slogans: sloganList, brandNotes: brandNotes.slice(0, 3).join(' · ') || undefined };
console.log(`\n──── Прочитано: ${done} графики · ${failed} паднати ────`);
console.log(`Вкупно: ${products.length} продукти, ${sloganList.length} слогани.`);

if (dry || !clientCode) {
  console.log('\n(--dry или без --client) Не праќам. Резултат:\n' + JSON.stringify(payload, null, 2));
  process.exit(0);
}

// Push aggregated proposals to GoScriptAI (resolves the client by CODE).
const apiUrl = process.env.API_URL || 'http://localhost:3011/api/v1';
const email = process.env.INGEST_EMAIL;
const password = process.env.INGEST_PASSWORD;
if (!email || !password) fail('За push треба INGEST_EMAIL и INGEST_PASSWORD во .env.');
const token = (
  await (
    await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  ).json()
)?.data?.token;
if (!token) fail('Најавата не успеа — провери INGEST_EMAIL/INGEST_PASSWORD.');
const clients = (await (await fetch(`${apiUrl}/clients`, { headers: { Authorization: `Bearer ${token}` } })).json())?.data ?? [];
const client = clients.find((c) => c.code === clientCode);
if (!client) fail(`Нема клиент со код „${clientCode}" во системот.`);

const res = await (
  await fetch(`${apiUrl}/clients/${client.id}/graphics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
).json();
console.log(`✅ Пратено: ${res.data?.products ?? 0} продукти + ${res.data?.slogans ?? 0} слогани за ${clientCode} (чекаат потврда во Мозок → Продукти / Речник).`);
