// Web scrape → product catalog proposals. Fetches a client's page, extracts the
// real products/services with Gemini, and pushes them into the brain as PENDING
// (confirmed=false) — the scriptwriter confirms in the Products tab.
//   npm run scrape -- "https://refan.mk/shop" --client=REFAN
import { GoogleGenAI } from '@google/genai';

function fail(m) {
  console.error('❌ ' + m);
  process.exit(1);
}

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const clientCode = args.find((a) => a.startsWith('--client='))?.split('=')[1] ?? null;
if (!url) fail('URL недостасува.\n   Пример: npm run scrape -- "https://сајт.mk/продукти" --client=REFAN');
if (!clientCode) fail('--client=КОД недостасува.');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) fail('GEMINI_API_KEY недостасува во .env.');
const models = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.6-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const apiUrl = process.env.API_URL || 'http://localhost:3011/api/v1';
const email = process.env.INGEST_EMAIL;
const password = process.env.INGEST_PASSWORD;
if (!email || !password) fail('Треба INGEST_EMAIL и INGEST_PASSWORD во .env.');

console.log(`Влечам ${url} …`);
let html;
try {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (GoScriptAI ingest)' } });
  if (!r.ok) fail(`Страницата врати ${r.status}.`);
  html = await r.text();
} catch (e) {
  fail('Не можам да ја вчитам страницата: ' + (e?.message ?? e));
}

let text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
if (text.length > 120000) text = text.slice(0, 120000);
console.log(`Содржина: ${text.length} знаци. Извлекувам продукти (${models.join(', ')})…`);

const ai = new GoogleGenAI({ apiKey });
const prompt =
  'Ти е дадена содржина од веб-страница на бизнис. Извлечи ги САМО вистинските ПРОДУКТИ/УСЛУГИ што ги продава — НЕ навигација, копчиња, реклами, footer, категории без производ. За секој врати: name (име), category (категорија ако е јасна), price (број во денари САМО ако е јасно наведена; изостави го полето ако не е), essence (кратко: што е и зошто е важно). Врати САМО валиден JSON: {"products":[{"name":"","category":"","price":0,"essence":""}]}. Ако нема продукти врати {"products":[]}. Содржина:\n\n' +
  text;

let res;
for (const m of models) {
  try {
    res = await ai.models.generateContent({ model: m, contents: prompt, config: { responseMimeType: 'application/json' } });
    break;
  } catch (e) {
    const msg = String(e?.message ?? e);
    const daily = /per\s*day/i.test(msg) || msg.includes('PerDay');
    if (daily) {
      console.log(`↪ ${m} го удри дневниот лимит, пробувам следен…`);
      continue;
    }
    fail('Извлекувањето не успеа: ' + msg);
  }
}
if (!res) fail('Сите модели го удрија дневниот лимит. Пробај подоцна или вклучи billing.');

let parsed;
try {
  const t = res.text ?? '';
  parsed = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
} catch (e) {
  fail('Извлекувањето не успеа: ' + (e?.message ?? e));
}

const products = (parsed.products ?? [])
  .filter((p) => p?.name)
  .map((p) => ({ name: p.name, category: p.category || undefined, price: p.price ? Number(p.price) : undefined, essence: p.essence || undefined }));
console.log(`Најдени ${products.length} продукти.`);
if (products.length === 0) process.exit(0);

const token = (
  await (
    await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json()
)?.data?.token;
if (!token) fail('Најавата не успеа — провери INGEST_EMAIL/INGEST_PASSWORD.');
const clients = (await (await fetch(`${apiUrl}/clients`, { headers: { Authorization: `Bearer ${token}` } })).json())?.data ?? [];
const client = clients.find((c) => c.code === clientCode);
if (!client) fail(`Нема клиент со код „${clientCode}" во системот.`);

const push = await (
  await fetch(`${apiUrl}/clients/${client.id}/products/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ products }),
  })
).json();
console.log(`✅ Создадени ${push.data?.created ?? 0} продукт-предлози за ${clientCode} (чекаат потврда во Мозок → Продукти).`);
