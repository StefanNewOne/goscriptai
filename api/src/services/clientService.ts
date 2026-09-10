import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { suggestClientCode, isValidClientCode } from '../domain/code.js';
import { transitionClient } from '../domain/clientMachine.js';
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
      changeLog: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  return client;
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
  const result = transitionClient({ from: client.status as never, to: to as never, role, data });
  if (!result.ok) throw new AppError(result.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'WRONG_STATUS', result.message);
  const updated = await prisma.client.update({ where: { id }, data: { status: to as never } });
  return { client: updated, sideEffects: result.sideEffects };
}

export function suggestCodeForName(name: string) {
  return suggestClientCode(name);
}
