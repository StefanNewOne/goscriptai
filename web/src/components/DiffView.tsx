// DiffView — a monospace line diff between two document versions (Design Brief
// §8: ClientProfile v3 → v4). Additions in ok, removals in fail, context muted.
// Pure LCS line diff so it works offline on any two strings.
export type DiffRow = { type: 'same' | 'add' | 'del'; text: string };

export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  // LCS length table
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      rows.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) rows.push({ type: 'del', text: a[i++]! });
  while (j < m) rows.push({ type: 'add', text: b[j++]! });
  return rows;
}

const ROW_CLASS: Record<DiffRow['type'], string> = {
  same: 'text-ink-2',
  add: 'bg-ok/10 text-ok',
  del: 'bg-fail/10 text-fail line-through',
};
const SIGN: Record<DiffRow['type'], string> = { same: ' ', add: '+', del: '−' };

export function DiffView({ before, after }: { before: string; after: string }) {
  const rows = diffLines(before, after);
  return (
    <div className="overflow-x-auto rounded-sheet border border-rule bg-sheet p-4 font-mono text-13 leading-[1.6]">
      {rows.map((r, i) => (
        <div key={i} className={`whitespace-pre-wrap px-1 ${ROW_CLASS[r.type]}`}>
          <span className="mr-2 select-none opacity-60">{SIGN[r.type]}</span>
          {r.text || ' '}
        </div>
      ))}
    </div>
  );
}
