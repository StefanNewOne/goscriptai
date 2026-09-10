import { prisma } from '../lib/prisma.js';

// Reports (Design Brief §7.14): monthly and per-client. Cost is in USD against
// the Max subscription credit.
export async function monthlyReport() {
  const sets = await prisma.scriptSet.findMany({
    include: { writer: { select: { name: true } }, _count: { select: { scripts: true } } },
  });
  const byMonth = new Map<string, { sets: number; scripts: number; costUsd: number; byWriter: Record<string, number> }>();
  for (const s of sets) {
    const row = byMonth.get(s.yymm) ?? { sets: 0, scripts: 0, costUsd: 0, byWriter: {} };
    row.sets += 1;
    row.scripts += s._count.scripts;
    row.costUsd += Number(s.spentUsd);
    row.byWriter[s.writer.name] = (row.byWriter[s.writer.name] ?? 0) + 1;
    byMonth.set(s.yymm, row);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([yymm, r]) => ({ yymm, ...r, costUsd: Number(r.costUsd.toFixed(2)) }));
}

export async function clientReport() {
  const clients = await prisma.client.findMany({ include: { _count: { select: { sets: true } } } });
  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    setsDone: c._count.sets,
    contract: c.reelsPerMonth ?? 0,
    spentUsd: Number(c.spentUsd),
    budgetUsd: Number(c.budgetUsd),
  }));
}
