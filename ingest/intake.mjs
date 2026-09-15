// Unified LOCAL intake — one command that fills a client's brain from all
// sources at once (web scrape + graphics + videos), instead of four separate
// runs. Everything runs on THIS machine; only the extracted results go to the
// DB (raw files never leave your disk). Each part is optional via its flag.
//
//   npm run intake -- --client=GODIGITAL \
//     --web="https://godigital.com.mk" \
//     --graphics="C:\...\GoDigital\ГРАФИКИ" \
//     --videos="C:\...\GoDigital"
//
// Docs (old scenario .docx) come with the rich-model step (D+E) — noted below.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fail(m) {
  console.error('❌ ' + m);
  process.exit(1);
}

const args = process.argv.slice(2);
const val = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
const clientCode = val('client');
const web = val('web');
const graphics = val('graphics');
const videos = val('videos');
const docs = val('docs');

if (!clientCode) fail('--client=КОД недостасува (пр. --client=GODIGITAL).');
if (!web && !graphics && !videos) fail('Дај барем еден извор: --web=URL, --graphics=ПАПКА, --videos=ПАПКА.');

// Run a sub-tool locally with the shared .env; stop the whole intake if one part
// hard-fails (non-zero exit), so you never get a half-filled brain silently.
function run(label, script, scriptArgs) {
  console.log(`\n════ ${label} ════`);
  const r = spawnSync('node', ['--env-file=.env', path.join(__dirname, script), ...scriptArgs], {
    stdio: 'inherit',
    cwd: __dirname,
  });
  if (r.status !== 0) fail(`„${label}" не успеа (exit ${r.status}). Внесот е запрен — поправи па пушти пак.`);
}

console.log(`Обединет внес за клиент ${clientCode}`);

if (web) run('Веб-скрејп', 'scrape-web.mjs', [web, `--client=${clientCode}`]);
if (graphics) run('Графики', 'graphic-to-brain.mjs', [graphics, `--client=${clientCode}`]);
if (videos) run('Видеа', 'video-to-script.mjs', [videos, '--push', `--client=${clientCode}`]);

if (docs) {
  console.log('\n⏭  Стари сценарија (--docs): доаѓа со богатиот модел (D+E) — прикачи ги преку UI кога ќе е готово.');
}

console.log(`\n✅ Обединет внес завршен за ${clientCode}. Потврди ги предлозите во Мозок, па „Ажурирај анализа" за профил што ги синтетизира сите извори.`);
