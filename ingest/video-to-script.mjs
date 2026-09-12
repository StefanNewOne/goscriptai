// Local ingestion: video -> script via Gemini.
// Run it pointed at a client folder that holds videos; it writes one .json and
// one readable .md per video into a `сценариа` subfolder.
//
//   cd ingest
//   npm install
//   copy .env.example .env   (fill GEMINI_API_KEY)
//   npm run video -- "C:\Users\User\Desktop\usb\ace\Desktop\Surovi videoa\<КЛИЕНТ>"
//
// Idempotent: skips a video whose .json already exists. One failure doesn't
// stop the batch. The Gemini model is read from GEMINI_MODEL (env).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR_NAME = 'сценариа';

const MIME = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry on 429 (rate limit) honoring the server's retryDelay. Caps attempts so
// a hard quota (free-tier limit 0) fails fast instead of looping forever.
async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message ?? e);
      const retryable =
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('500');
      // A per-DAY quota won't recover for hours — fail fast (billing needed).
      const dailyQuota = /per\s*day/i.test(msg) || msg.includes('PerDay');
      if (!retryable || dailyQuota || attempt >= 6) throw e;
      const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":\s*"(\d+)s"/);
      const delay = m ? Math.ceil(parseFloat(m[1])) + 1 : Math.min(60, 2 ** attempt * 5);
      console.log(`   ⏳ лимит (429) — чекам ${delay}s па пробувам пак (${attempt + 1}/5)…`);
      await sleep(delay * 1000);
    }
  }
}

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((a) => a.startsWith('--'));
const folder = rawArgs.find((a) => !a.startsWith('--'));
const push = flags.includes('--push');
const clientCode = flags.find((a) => a.startsWith('--client='))?.split('=')[1] ?? null;

if (!folder) fail('Патека до фолдер со видеа недостасува.\n   Пример: npm run video -- "C:\\...\\Surovi videoa\\КЛИЕНТ"');
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) fail(`Фолдерот не постои: ${folder}`);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) fail('GEMINI_API_KEY недостасува. Копирај .env.example во .env и внеси клуч.');
// One or more models (comma-separated in GEMINI_MODELS). On a per-DAY free-tier
// quota, the tool rotates to the next model automatically.
const models = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.6-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
let modelIdx = 0;

const systemInstruction = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
const ai = new GoogleGenAI({ apiKey });

// --push: after each video, send the extraction to GoScriptAI (PENDING brain).
// Resolves the client by CODE via the API. Needs API_URL + INGEST_EMAIL/PASSWORD.
let pushCtx = null;
if (push) {
  if (!clientCode) fail('--push бара --client=КОД (пр. --client=GODIGITAL).');
  const apiUrl = process.env.API_URL || 'http://localhost:3011/api/v1';
  const email = process.env.INGEST_EMAIL;
  const password = process.env.INGEST_PASSWORD;
  if (!email || !password) fail('За --push треба INGEST_EMAIL и INGEST_PASSWORD во .env.');
  const login = await (
    await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json();
  const token = login?.data?.token;
  if (!token) fail('Најавата за --push не успеа — провери INGEST_EMAIL/INGEST_PASSWORD.');
  const clients = (await (await fetch(`${apiUrl}/clients`, { headers: { Authorization: `Bearer ${token}` } })).json())?.data ?? [];
  const client = clients.find((c) => c.code === clientCode);
  if (!client) fail(`Нема клиент со код „${clientCode}" во системот. Креирај го прво во UI.`);
  pushCtx = { apiUrl, token, clientId: client.id };
  console.log(`Push → клиент ${clientCode} (${client.id})`);
}

const videos = fs
  .readdirSync(folder)
  .filter((f) => MIME[path.extname(f).toLowerCase()])
  .sort();

if (videos.length === 0) fail('Нема видеа во фолдерот (mp4/mov/webm/...).');

const outDir = path.join(folder, OUT_DIR_NAME);
fs.mkdirSync(outDir, { recursive: true });

console.log(`Модели: ${models.join(', ')}\nВидеа: ${videos.length}\nИзлез: ${outDir}\n`);

let done = 0;
let skipped = 0;
let failed = 0;

for (const name of videos) {
  const base = path.basename(name, path.extname(name));
  const outJson = path.join(outDir, `${base}.json`);
  if (fs.existsSync(outJson)) {
    skipped++;
    console.log(`⏭  ${name} — веќе обработено`);
    continue;
  }
  const ext = path.extname(name).toLowerCase();
  const full = path.join(folder, name);
  const mimeType = MIME[ext];
  // The upload puts the file name into an HTTP header (ASCII only); Cyrillic /
  // emoji names break it. Copy to an ASCII temp path and upload that instead.
  const tmp = path.join(os.tmpdir(), `gsi_${Date.now()}_${done + failed + skipped}${ext}`);
  try {
    fs.copyFileSync(full, tmp);
    console.log(`▶  ${name} — качувам…`);
    let file = await withRetry(() => ai.files.upload({ file: tmp, config: { mimeType, displayName: `video${ext}` } }));
    while (file.state === 'PROCESSING') {
      await sleep(5000);
      file = await ai.files.get({ name: file.name });
    }
    if (file.state === 'FAILED') throw new Error('Gemini не го обработи видеото (state=FAILED).');

    // Generate; on a per-day free-tier quota, rotate to the next model and retry
    // the same (already-uploaded) video.
    let response;
    for (;;) {
      console.log(`   обработувам со ${models[modelIdx]}…`);
      try {
        response = await withRetry(() =>
          ai.models.generateContent({
            model: models[modelIdx],
            contents: [
              {
                role: 'user',
                parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: 'Обработи го видеото.' }],
              },
            ],
            config: { systemInstruction, responseMimeType: 'application/json' },
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
        throw e;
      }
    }

    const parsed = parseJson(response.text);
    fs.writeFileSync(outJson, JSON.stringify(parsed, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, `${base}.md`), renderMarkdown(parsed, base), 'utf8');
    if (pushCtx) {
      try {
        const pr = await fetch(`${pushCtx.apiUrl}/clients/${pushCtx.clientId}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pushCtx.token}` },
          body: JSON.stringify({ filename: name, extraction: parsed }),
        });
        console.log(pr.ok ? '   ↑ пратено во Мозокот' : `   ⚠ push не успеа (${pr.status})`);
      } catch (e) {
        console.log(`   ⚠ push грешка: ${e?.message ?? e}`);
      }
    }
    // Tidy up the uploaded file on Gemini's side (best-effort).
    try {
      await ai.files.delete({ name: file.name });
    } catch {
      /* ignore */
    }
    done++;
    console.log(`✅ ${name} → ${base}.json + ${base}.md`);
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e?.message ?? e}`);
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

console.log(`\n──── Готово: ${done} обработени · ${skipped} прескокнати · ${failed} паднати ────`);

function parseJson(text) {
  if (!text) throw new Error('Празен одговор од моделот.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Одговорот не е валиден JSON.');
  return JSON.parse(body.slice(start, end + 1));
}

function renderMarkdown(d, base) {
  const s = d.script ?? {};
  const b = d.brain ?? {};
  const L = [];
  L.push(`# ${s.title ?? base}`);
  const meta = [s.format, s.language, s.durationSec ? `~${s.durationSec} сек` : null, (s.platforms ?? []).join(' + ') || null]
    .filter(Boolean)
    .join(' · ');
  if (meta) L.push(`_${meta}_`);
  if (s.vibe) L.push(`**Вајб:** ${s.vibe}`);
  if (s.music) L.push(`**Музика:** ${s.music}`);
  L.push('');
  if (s.hook) L.push(`**ХООК:** ${s.hook}`);
  L.push('');
  L.push('## Кадар по кадар');
  for (const sh of s.shots ?? []) {
    L.push(`**КАДАР ${sh.index} (${sh.role})** — ${sh.description ?? ''}${sh.onScreenText ? `  \n_Текст на екран: ${sh.onScreenText}_` : ''}`);
    if (sh.line) L.push(`> ${sh.actor ? sh.actor + ': ' : ''}„${sh.line}"`);
    L.push('');
  }
  if (s.cta) {
    L.push('## ЦТА');
    L.push(s.cta);
    L.push('');
  }
  L.push('---');
  L.push('## Предлози за Мозокот (потврди)');
  const t = b.tags ?? {};
  L.push(`- **Тагови:** тип: ${t.videoType ?? '—'} · тема: ${(t.topic ?? []).join(', ') || '—'} · хоок: ${t.hookType ?? '—'} · цел: ${t.ctaGoal ?? '—'}${(t.extra ?? []).length ? ` · +${t.extra.join(', ')}` : ''}`);
  for (const m of b.productMentions ?? []) L.push(`- **Продукт:** ${m.name} — ${m.essence}${m.quote ? `  \n  „${m.quote}"` : ''}`);
  const actors = b.actors ?? (b.actorHint ? [b.actorHint] : []);
  if (actors.length === 0) L.push('- **Актери (насока):** —');
  else
    actors.forEach((a, i) =>
      L.push(`- **Актер${actors.length > 1 ? ' ' + (i + 1) : ''} (насока):** ${[a.gender, a.ageRange, a.look].filter(Boolean).join(', ') || '—'}`),
    );
  L.push(`- **Аватар на купувач:** ${b.buyerAvatar?.persona ?? '—'}`);
  if (d.extraction?.assumptions) L.push(`- **Претпоставки:** ${d.extraction.assumptions}`);
  return L.join('\n') + '\n';
}
