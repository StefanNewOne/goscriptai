import { describe, it, expect } from 'vitest';
import { scriptLineSet, jaccard, scriptSimilarity } from './similarity.js';
import type { ScriptContent } from './scriptFormat.js';

const mk = (texts: string[]): ScriptContent => ({
  frames: texts.map((t) => ({ role: 'БОДИ' as const, direction: '', lines: [{ actor: 'A', text: t }] })),
});

describe('similarity', () => {
  it('normalizes lines and drops short ones', () => {
    const s = scriptLineSet(mk(['Ве слушаме, сите!', 'ок', 'Ве слушаме сите']));
    // "ок" is too short (≤3); the two "Ве слушаме сите" normalize to one entry.
    expect(s.size).toBe(1);
    expect(s.has('ве слушаме сите')).toBe(true);
  });

  it('jaccard is 1 for identical, 0 for disjoint', () => {
    const a = mk(['Едно добро', 'Второ добро']);
    expect(scriptSimilarity(a, a)).toBe(1);
    expect(scriptSimilarity(a, mk(['Сосема друго', 'Пак друго']))).toBe(0);
  });

  it('an old doc twin scores high against its near-identical video script', () => {
    const oldDoc = mk(['Ве слушаме и се подобруваме', 'Дојди и пробај го системот', 'Нов QR систем на масата']);
    const videoTwin = mk(['Ве слушаме и се подобруваме', 'Дојди и пробај го системот', 'Нов QR систем на секоја маса']);
    expect(scriptSimilarity(oldDoc, videoTwin)).toBeGreaterThan(0.4);
  });

  it('empty content is 0', () => {
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});
