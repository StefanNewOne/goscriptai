// Push already-generated сценариа/*.json into the brain — no Gemini re-run.
// Useful to send previously processed videos, or to retry a failed push.
//   npm run push -- "C:\...\Surovi videoa\GoDigital\тест" --client=GODIGITAL
import fs from 'node:fs';
import path from 'node:path';

function fail(m) {
  console.error('❌ ' + m);
  process.exit(1);
}

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const clientCode = args.find((a) => a.startsWith('--client='))?.split('=')[1] ?? null;
const autoConfirm = args.includes('--confirm'); // confirm each pushed script immediately
if (!folder) fail('Патека до фолдер (со подфолдер сценариа) недостасува.');
if (!clientCode) fail('--client=КОД недостасува (пр. --client=GODIGITAL).');

const dir = path.join(folder, 'сценариа');
if (!fs.existsSync(dir)) fail(`Нема подфолдер „сценариа" во ${folder}. Прво пушти npm run video.`);

const apiUrl = process.env.API_URL || 'http://localhost:3011/api/v1';
const email = process.env.INGEST_EMAIL;
const password = process.env.INGEST_PASSWORD;
if (!email || !password) fail('Треба INGEST_EMAIL и INGEST_PASSWORD во .env.');

const login = await (
  await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
).json();
const token = login?.data?.token;
if (!token) fail('Најавата не успеа — провери INGEST_EMAIL/INGEST_PASSWORD.');

const clients = (await (await fetch(`${apiUrl}/clients`, { headers: { Authorization: `Bearer ${token}` } })).json())?.data ?? [];
const client = clients.find((c) => c.code === clientCode);
if (!client) fail(`Нема клиент со код „${clientCode}" во системот. Креирај го прво во UI.`);

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
console.log(`Праќам ${files.length} сценарија → клиент ${clientCode} (${client.id})\n`);

let ok = 0;
let bad = 0;
let skipped = 0;
let confirmed = 0;
for (const f of files) {
  try {
    const extraction = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = await fetch(`${apiUrl}/clients/${client.id}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: f.replace(/\.json$/, ''), extraction }),
    });
    if (!r.ok) {
      bad++;
      console.log(`❌ ${f} (${r.status})`);
      continue;
    }
    const data = (await r.json())?.data ?? {};
    if (data.duplicate) {
      skipped++;
      console.log(`⏭  ${f} — веќе внесено`);
      continue;
    }
    ok++;
    console.log(`✅ ${f}`);
    if (autoConfirm && data.mediaAssetId) {
      const cr = await fetch(`${apiUrl}/clients/${client.id}/ingest/${data.mediaAssetId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cr.ok) {
        confirmed++;
        console.log(`   ↳ потврдено`);
      } else {
        console.log(`   ⚠ потврда не успеа (${cr.status})`);
      }
    }
  } catch (e) {
    bad++;
    console.log(`❌ ${f}: ${e?.message ?? e}`);
  }
}
console.log(`\nГотово: ${ok} пратени${autoConfirm ? ` · ${confirmed} потврдени` : ''} · ${skipped} прескокнати (веќе внесени) · ${bad} паднати`);
