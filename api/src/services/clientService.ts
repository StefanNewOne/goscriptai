import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { suggestClientCode, isValidClientCode } from '../domain/code.js';
import { transitionClient } from '../domain/clientMachine.js';
import { publish } from '../events/bus.js';
import type { Role } from '../domain/types.js';
import type { CreateClientInput, UpdateClientInput } from '../schemas/client.js';

export async function listClients() {
  return prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { sets: true, avatars: true } } },
  });
}

export async function getClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      profiles: { orderBy: { version: 'desc' } },
      avatars: true,
      products: true,
      actors: true,
      locations: true,
      competitors: true,
      references: true,
      glossary: true,
      insights: { orderBy: { weight: 'desc' } },
      changeLog: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  return client;
}

// Read-only summary of a client's sets with concept decisions and the scripts
// written, for client-level traceability (which concepts were chosen, and which
// script came from which concept). No status changes.
export async function listClientSets(id: string) {
  await getClient(id); // 404 if the client doesn't exist
  const sets = await prisma.scriptSet.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      concepts: { select: { id: true, type: true, decision: true, card: true } },
      scripts: {
        select: { id: true, code: true, title: true, type: true, status: true, conceptId: true },
        orderBy: { code: 'asc' },
      },
    },
  });
  return sets.map((s) => ({
    id: s.id,
    yymm: s.yymm,
    status: s.status,
    requested: s.requested,
    createdAt: s.createdAt,
    concepts: s.concepts.map((c) => ({
      id: c.id,
      type: c.type,
      decision: c.decision,
      hook: (c.card as { hook?: string } | null)?.hook ?? '',
    })),
    scripts: s.scripts,
  }));
}

export async function createClient(input: CreateClientInput) {
  const code = input.code ?? suggestClientCode(input.name);
  if (!isValidClientCode(code)) {
    throw new AppError('VALIDATION_FAILED', 'Кодот е невалиден.');
  }
  const existing = await prisma.client.findUnique({ where: { code } });
  if (existing) throw new AppError('DUPLICATE_CODE', `Кодот ${code} е веќе зафатен.`);

  const client = await prisma.client.create({
    data: {
      name: input.name,
      code,
      industry: input.industry,
      language: input.language,
      websiteUrl: input.websiteUrl || null,
      reelsPerMonth: input.reelsPerMonth,
      graphicsPerMonth: input.graphicsPerMonth,
      status: 'DRAFT',
    },
  });

  // If a brief/sources came in, the client is ready for intake.
  if (input.textBrief || input.websiteUrl) {
    await prisma.brainChange.create({
      data: { clientId: client.id, kind: 'Intake', summary: 'Клиентот е внесен со почетен бриф.' },
    });
  }
  return client;
}

export async function updateClient(id: string, input: UpdateClientInput) {
  await getClient(id);
  return prisma.client.update({
    where: { id },
    data: {
      name: input.name,
      industry: input.industry,
      language: input.language,
      websiteUrl: input.websiteUrl || undefined,
      reelsPerMonth: input.reelsPerMonth,
      graphicsPerMonth: input.graphicsPerMonth,
    },
  });
}

// Advance the client onboarding machine (the only place status changes — invariant 1).
export async function advanceClient(id: string, to: string, role: Role, data?: Record<string, unknown>) {
  const client = await getClient(id);
  const from = client.status;
  const result = transitionClient({ from: from as never, to: to as never, role, data });
  if (!result.ok) throw new AppError(result.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'WRONG_STATUS', result.message);
  // Guarded on the source status (invariant 1): applies only if still in `from`.
  const res = await prisma.client.updateMany({ where: { id, status: from }, data: { status: to as never } });
  if (res.count === 0) throw new AppError('WRONG_STATUS', 'Статусот на клиентот се промени во меѓувреме.');
  await publish({ type: 'status.changed', scope: 'client', id, status: to });
  const updated = await prisma.client.findUniqueOrThrow({ where: { id } });
  return { client: updated, sideEffects: result.sideEffects };
}

export function suggestCodeForName(name: string) {
  return suggestClientCode(name);
}
