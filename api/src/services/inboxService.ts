import { prisma } from '../lib/prisma.js';
import { INBOX_GROUP_ORDER } from '../domain/checkpoints.js';

// Aggregates every checkpoint waiting for a human, across all clients and sets
// (Design Brief §7.1). Grouped in the fixed order; each row deep-links to the
// decision screen.

export interface InboxItem {
  group: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  setId?: string;
  setLabel?: string;
  what: string;
  link: string;
  writer?: string;
  waitingSince: string;
}

const CLIENT_CHECKPOINT_GROUP: Record<string, { group: string; what: string }> = {
  ANALYST_QUESTIONS: { group: 'Прашања од анализа', what: 'Прашања од анализа' },
  ANALYST_REVIEW: { group: 'Предлози за потврда', what: 'Профил за одобрување' },
  AVATARS_REVIEW: { group: 'Предлози за потврда', what: 'Аватари за потврда' },
  MANUAL_SETUP: { group: 'Предлози за потврда', what: 'Рачно поставување' },
};

export async function getInbox(writerUserId?: string): Promise<{ groups: { group: string; items: InboxItem[] }[]; total: number }> {
  const items: InboxItem[] = [];

  // Client onboarding checkpoints
  const clients = await prisma.client.findMany({
    where: { status: { in: Object.keys(CLIENT_CHECKPOINT_GROUP) as never } },
  });
  for (const c of clients) {
    const meta = CLIENT_CHECKPOINT_GROUP[c.status];
    if (!meta) continue;
    items.push({
      group: meta.group,
      clientId: c.id,
      clientName: c.name,
      clientCode: c.code,
      what: meta.what,
      link: `/clients/${c.id}`,
      waitingSince: c.updatedAt.toISOString(),
    });
  }

  // Set checkpoints (concepts / scripts). Optionally filtered to my sets.
  const sets = await prisma.scriptSet.findMany({
    where: { status: { in: ['CONCEPTS_REVIEW', 'SCRIPTS_REVIEW', 'BUDGET_HOLD'] }, writerUserId },
    include: { client: true, writer: { select: { name: true } } },
  });
  for (const s of sets) {
    const label = `Сет ${s.client.code}-${s.yymm}`;
    if (s.status === 'CONCEPTS_REVIEW') {
      items.push({ group: 'Концепти за избор', clientId: s.clientId, clientName: s.client.name, clientCode: s.client.code, setId: s.id, setLabel: label, what: 'Концепти за избор', link: `/sets/${s.id}`, writer: s.writer.name, waitingSince: s.updatedAt.toISOString() });
    } else if (s.status === 'SCRIPTS_REVIEW') {
      items.push({ group: 'Сценарија за одобрување', clientId: s.clientId, clientName: s.client.name, clientCode: s.client.code, setId: s.id, setLabel: label, what: 'Сценарија за одобрување', link: `/sets/${s.id}`, writer: s.writer.name, waitingSince: s.updatedAt.toISOString() });
    } else if (s.status === 'BUDGET_HOLD') {
      items.push({ group: 'Буџет', clientId: s.clientId, clientName: s.client.name, clientCode: s.client.code, setId: s.id, setLabel: label, what: 'Буџетот е достигнат', link: `/sets/${s.id}`, writer: s.writer.name, waitingSince: s.updatedAt.toISOString() });
    }
  }

  const groups = INBOX_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter((g) => g.items.length > 0);
  return { groups, total: items.length };
}
