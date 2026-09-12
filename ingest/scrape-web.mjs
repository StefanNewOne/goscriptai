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
const crawl = args.includes('--crawl');
const maxPages = Number.parseInt(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? '20', 10);
if (!url) fail('URL недостасува.\n   Пример: npm run scrape -- "https://сајт.mk/продукти" --client=REFAN [--crawl]');
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

const UA = 'Mozilla/5.0 (GoScriptAI ingest)';
async function fetchText(u) {
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(String(r.status));
  const h = await r.text();
  return h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let text;
if (crawl) {
  console.log(`Краулам од ${url} …`);
  let startHtml;
  try {
    startHtml = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  } catch (e) {
    fail('Не можам да ја вчитам почетната страница: ' + (e?.message ?? e));
  }
  const base = new URL(url);
  const links = new Set([url]);
  for (const mm of startHtml.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const abs = new URL(mm[1], url);
      if (abs.host !== base.host) continue;
      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|xml|woff2?)($|\?)/i.test(abs.pathname)) continue;
      abs.hash = '';
      links.add(abs.toString());
    } catch {
      /* ignore */
    }
  }
  // Prioritise likely service/product pages so they fit within maxPages.
  const KW = /услуг|продукт|product|service|shop|prodav|catalog|katalog|reels|video|дизајн|цен|price|portfolio|portfolio/i;
  const ordered = [...links].sort((a, b) => (KW.test(b) ? 1 : 0) - (KW.test(a) ? 1 : 0));
  const pages = ordered.slice(0, maxPages);
  console.log(`Најдени ${links.size} внатрешни линкови; читам ${pages.length}…`);
  const parts = [];
  for (const p of pages) {
    try {
      const t = await fetchText(p);
      if (t) parts.push(`\n\n=== ${p} ===\n${t}`);
    } catch {
      /* skip broken page */
    }
  }
  text = parts.join('');
} else {
  console.log(`Влечам ${url} …`);
  try {
    text = await fetchText(url);
  } catch (e) {
    fail('Не можам да ја вчитам страницата: ' + (e?.message ?? e));
  }
}
if (text.length > 250000) text = text.slice(0, 250000);
console.log(`Содржина: ${text.length} знаци. Извлекувам продукти (${models.join(', ')})…`);

const ai = new GoogleGenAI({ apiKey });
const prompt =
  'Ти е дадена содржина од веб-страница на бизнис. Извлечи ги САМО вистинските ПРОДУКТИ/УСЛУГИ што ги продава — НЕ навигација, копчиња, реклами, footer, категории без производ. За секој врати: name (име), category (категорија ако е јасна), price (број во денари САМО ако е јасно наведена; изостави го полето ако не е), essence (кратко: што е и зошто е важно). Врати САМО валиден JSON: {"products":[{"name":"","category":"","price":0,"essence":""}]}. Ако нема продукти врати {"products":[]}. Содржина:\n\n' +
  text;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let res;
outer: for (const m of models) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      res = await ai.models.generateContent({ model: m, contents: prompt, config: { responseMimeType: 'application/json' } });
      break outer;
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/per\s*day/i.test(msg) || msg.includes('PerDay')) {
        console.log(`↪ ${m} го удри дневниот лимит, пробувам следен модел…`);
        break; // next model
      }
      const transient =
        msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded') || msg.includes('500') || msg.includes('429');
      if (transient && attempt < 4) {
        const mm = msg.match(/retry in ([\d.]+)s/i);
        const delay = mm ? Math.ceil(parseFloat(mm[1])) + 1 : Math.min(60, 2 ** attempt * 5);
        console.log(`   ⏳ ${m}: привремено (${delay}s), пробувам пак…`);
        await sleep(delay * 1000);
        continue;
      }
      fail('Извлекувањето не успеа: ' + msg);
    }
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
