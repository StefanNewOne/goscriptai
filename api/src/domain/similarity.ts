import type { ScriptContent } from './scriptFormat.js';

// Lexical similarity for reconciling scripts. An imported old delivered script
// and its video-derived twin share near-identical replica text (same video), so
// line overlap finds the twin far more reliably than semantic embeddings would —
// and needs no embedding provider. Pure functions → unit-testable.

// The set of normalized reply lines in a script (short/empty lines dropped).
export function scriptLineSet(content: ScriptContent): Set<string> {
  const set = new Set<string>();
  for (const f of content.frames) {
    for (const l of f.lines) {
      const t = String(l.text ?? '')
        .toLowerCase()
        .replace(/[„"“”'.,!?…:;()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t.length > 3) set.add(t);
    }
  }
  return set;
}

// Jaccard overlap of two line-sets, 0..1.
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function scriptSimilarity(a: ScriptContent, b: ScriptContent): number {
  return jaccard(scriptLineSet(a), scriptLineSet(b));
}
