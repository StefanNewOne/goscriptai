// Lists Gemini models your API key can call (those supporting generateContent).
// Uses the REST ListModels endpoint (no SDK), key from GEMINI_API_KEY.
//   node --env-file=.env list-models.mjs
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('❌ GEMINI_API_KEY недостасува (во .env).');
  process.exit(1);
}
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`);
const json = await res.json();
if (json.error) {
  console.error('❌', JSON.stringify(json.error));
  process.exit(1);
}
const models = (json.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'));
console.log(`Модели со generateContent (${models.length}):\n`);
for (const m of models) {
  console.log('• ' + m.name.replace('models/', ''));
}
