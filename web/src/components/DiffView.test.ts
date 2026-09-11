import { describe, it, expect } from 'vitest';
import { diffLines } from './DiffView';

describe('diffLines', () => {
  it('marks identical text as all-same', () => {
    const rows = diffLines('a\nb\nc', 'a\nb\nc');
    expect(rows.every((r) => r.type === 'same')).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('detects a single added line', () => {
    const rows = diffLines('a\nb', 'a\nX\nb');
    expect(rows.map((r) => r.type)).toEqual(['same', 'add', 'same']);
    expect(rows.find((r) => r.type === 'add')?.text).toBe('X');
  });

  it('detects a single removed line', () => {
    const rows = diffLines('a\nb\nc', 'a\nc');
    expect(rows.map((r) => r.type)).toEqual(['same', 'del', 'same']);
    expect(rows.find((r) => r.type === 'del')?.text).toBe('b');
  });

  it('treats a replaced line as del + add', () => {
    const rows = diffLines('a\nold\nc', 'a\nnew\nc');
    const types = rows.map((r) => r.type);
    expect(types).toContain('del');
    expect(types).toContain('add');
    expect(rows.find((r) => r.type === 'del')?.text).toBe('old');
    expect(rows.find((r) => r.type === 'add')?.text).toBe('new');
  });

  it('handles fully disjoint content (all removed then all added)', () => {
    const rows = diffLines('x\ny', 'p\nq');
    expect(rows.filter((r) => r.type === 'del').map((r) => r.text)).toEqual(['x', 'y']);
    expect(rows.filter((r) => r.type === 'add').map((r) => r.text)).toEqual(['p', 'q']);
  });

  it('handles empty before (everything added)', () => {
    const rows = diffLines('', 'a\nb');
    // '' splits to [''] so one empty "same"/"del" is possible; the real lines are adds.
    expect(rows.filter((r) => r.type === 'add').map((r) => r.text)).toEqual(['a', 'b']);
  });

  it('preserves cyrillic content verbatim', () => {
    const rows = diffLines('Профил v1\nСуштина', 'Профил v2\nСуштина');
    expect(rows.find((r) => r.type === 'add')?.text).toBe('Профил v2');
    expect(rows.find((r) => r.type === 'del')?.text).toBe('Профил v1');
    expect(rows.find((r) => r.type === 'same')?.text).toBe('Суштина');
  });
});
