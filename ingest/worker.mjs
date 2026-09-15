// Local companion worker — the LOCAL half of UI-triggered intake. It runs on the
// operator's machine, polls GoScriptAI for intake jobs the scriptwriter created
// in the UI, and executes them LOCALLY (scrape/Gemini/docs), uploading only the
// results. Raw files never leave this machine.
//
//   cd ingest && npm run worker     (leave it running)
//
// The UI (client → Полни мозок) creates the jobs; this picks them up.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL || 'http://localhost:3011/api/v1';
const email = process.env.INGEST_EMAIL;
const password = process.env.INGEST_PASSWORD;
const POLL_MS = Number.parseInt(process.env.WORKER_POLL_MS || '5000', 10);

function fail(m) {
  console.error('❌ ' + m);
  process.exit(1);
}
if (!email || !password) fail('Треба INGEST_EMAIL и INGEST_PASSWORD во .env.');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const r = await (
    await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  ).json();
  if (!r?.data?.token) fail('Најавата не успеа — провери INGEST_EMAIL/INGEST_PASSWORD.');
  return r.data.token;
}

let token = await login();
const auth = () => ({ Authorization: `Bearer ${token}` });

async function api(method, pathname, body) {
  let res = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    token = await login();
    res = await fetch(`${apiUrl}${pathname}`, { method, headers: { 'Content-Type': 'application/json', ...auth() }, body: body ? JSON.stringify(body) : undefined });
  }
  return res.json();
}

const patch = (id, data) => api('PATCH', `/intake/jobs/${id}`, data).catch(() => {});

// Run a local sub-tool; return true on success.
function run(script, args, jobId, label) {
  console.log(`   ▶ ${label}`);
  void patch(jobId, { progress: label });
  const r = spawnSync('node', ['--env-file=.env', path.join(__dirname, script), ...args], { stdio: 'inherit', cwd: __dirname });
  return r.status === 0;
}

// Upload every .docx in a folder to the rich importer.
async function importDocs(dir, clientId, jobId) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));
  let ok = 0;
  for (const f of files) {
    void patch(jobId, { progress: `Документи: ${f}` });
    const form = new FormData();
    form.append('clientId', clientId);
    form.append('isStarExample', 'true');
    form.append('file', new Blob([fs.readFileSync(path.join(dir, f))]), f);
    const res = await fetch(`${apiUrl}/import/document`, { method: 'POST', headers: auth(), body: form });
    if (res.ok) ok++;
    else console.log(`   ⚠ ${f} не се внесе (${res.status})`);
  }
  console.log(`   ✓ документи: ${ok}/${files.length}`);
}

async function handle(job) {
  const code = job.client?.code;
  console.log(`\n▶ Налог ${job.id} — клиент ${code}`);
  try {
    if (job.webUrl) if (!run('scrape-web.mjs', [job.webUrl, `--client=${code}`], job.id, 'Веб-скрејп')) throw new Error('веб-скрејп падна');
    if (job.graphicsPath) if (!run('graphic-to-brain.mjs', [job.graphicsPath, `--client=${code}`], job.id, 'Графики')) throw new Error('графики падна');
    if (job.videosPath) if (!run('video-to-script.mjs', [job.videosPath, '--push', `--client=${code}`], job.id, 'Видеа')) throw new Error('видеа падна');
    if (job.docsPath) await importDocs(job.docsPath, job.clientId, job.id);
    await patch(job.id, { status: 'DONE', progress: 'Готово' });
    console.log(`✅ Налог ${job.id} завршен`);
  } catch (e) {
    await patch(job.id, { status: 'FAILED', error: String(e?.message ?? e) });
    console.log(`❌ Налог ${job.id}: ${e?.message ?? e}`);
  }
}

console.log(`Локален работник активен → ${apiUrl} (полл на ${POLL_MS}ms). Ctrl+C за стоп.`);
for (;;) {
  try {
    const r = await api('GET', '/intake/jobs/next');
    if (r?.data) await handle(r.data);
    else await sleep(POLL_MS);
  } catch (e) {
    console.log(`⚠ полл грешка: ${e?.message ?? e}`);
    await sleep(POLL_MS);
  }
}
