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

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

const folder = process.argv[2];
if (!folder) fail('Патека до фолдер со видеа недостасува.\n   Пример: npm run video -- "C:\\...\\Surovi videoa\\КЛИЕНТ"');
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) fail(`Фолдерот не постои: ${folder}`);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) fail('GEMINI_API_KEY недостасува. Копирај .env.example во .env и внеси клуч.');
const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';

const systemInstruction = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
const ai = new GoogleGenAI({ apiKey });

const videos = fs
  .readdirSync(folder)
  .filter((f) => MIME[path.extname(f).toLowerCase()])
  .sort();

if (videos.length === 0) fail('Нема видеа во фолдерот (mp4/mov/webm/...).');

const outDir = path.join(folder, OUT_DIR_NAME);
fs.mkdirSync(outDir, { recursive: true });

console.log(`Модел: ${model}\nВидеа: ${videos.length}\nИзлез: ${outDir}\n`);

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
    let file = await ai.files.upload({ file: tmp, config: { mimeType, displayName: `video${ext}` } });
    while (file.state === 'PROCESSING') {
      await sleep(5000);
      file = await ai.files.get({ name: file.name });
    }
    if (file.state === 'FAILED') throw new Error('Gemini не го обработи видеото (state=FAILED).');

    console.log(`   обработувам со ${model}…`);
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: 'Обработи го видеото.' }],
        },
      ],
      config: { systemInstruction, responseMimeType: 'application/json' },
    });

    const parsed = parseJson(response.text);
    fs.writeFileSync(outJson, JSON.stringify(parsed, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, `${base}.md`), renderMarkdown(parsed, base), 'utf8');
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
  const ah = b.actorHint ?? {};
  L.push(`- **Актер (насока):** ${[ah.gender, ah.ageRange, ah.look].filter(Boolean).join(', ') || '—'}`);
  L.push(`- **Аватар на купувач:** ${b.buyerAvatar?.persona ?? '—'}`);
  if (d.extraction?.assumptions) L.push(`- **Претпоставки:** ${d.extraction.assumptions}`);
  return L.join('\n') + '\n';
}
