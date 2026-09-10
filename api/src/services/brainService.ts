import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { z } from 'zod';
import {
  productSchema,
  actorSchema,
  locationSchema,
  competitorSchema,
  referenceSchema,
  glossarySchema,
} from '../schemas/brain.js';

async function ensureClient(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  return client;
}

async function logChange(clientId: string, kind: string, summary: string) {
  await prisma.brainChange.create({ data: { clientId, kind, summary } });
}

// ── Products ────────────────────────────────────────────────────────
export async function createProduct(clientId: string, body: unknown) {
  await ensureClient(clientId);
  const d = productSchema.parse(body);
  const p = await prisma.product.create({ data: { clientId, ...d } });
  await logChange(clientId, 'Продукт', `Додаден продукт „${p.name}“.`);
  return p;
}
export async function updateProduct(id: string, body: unknown) {
  const d = productSchema.partial().parse(body);
  return prisma.product.update({ where: { id }, data: d });
}
export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
}

// ── Actors ──────────────────────────────────────────────────────────
export async function createActor(clientId: string | null, body: unknown) {
  if (clientId) await ensureClient(clientId);
  const d = actorSchema.parse({ ...(body as object), clientId });
  const a = await prisma.actor.create({ data: { ...d, clientId } });
  if (clientId) await logChange(clientId, 'Актер', `Додаден актер „${a.name}“.`);
  return a;
}
export async function updateActor(id: string, body: unknown) {
  const d = actorSchema.partial().parse(body);
  return prisma.actor.update({ where: { id }, data: d });
}
export async function deleteActor(id: string) {
  await prisma.actor.delete({ where: { id } });
}

// ── Locations ───────────────────────────────────────────────────────
export async function createLocation(clientId: string, body: unknown) {
  await ensureClient(clientId);
  const d = locationSchema.parse(body);
  const l = await prisma.location.create({ data: { clientId, ...d } });
  await logChange(clientId, 'Локација', `Додадена локација „${l.name}“.`);
  return l;
}
export async function updateLocation(id: string, body: unknown) {
  const d = locationSchema.partial().parse(body);
  return prisma.location.update({ where: { id }, data: d });
}
export async function deleteLocation(id: string) {
  await prisma.location.delete({ where: { id } });
}

// ── Competitors ─────────────────────────────────────────────────────
export async function createCompetitor(clientId: string, body: unknown) {
  await ensureClient(clientId);
  const d = competitorSchema.parse(body);
  return prisma.competitor.create({ data: { clientId, ...d } });
}
export async function updateCompetitor(id: string, body: unknown) {
  const d = competitorSchema.partial().parse(body);
  return prisma.competitor.update({ where: { id }, data: d });
}
export async function deleteCompetitor(id: string) {
  await prisma.competitor.delete({ where: { id } });
}

// ── References ──────────────────────────────────────────────────────
export async function createReference(clientId: string, body: unknown) {
  await ensureClient(clientId);
  const d = referenceSchema.parse(body);
  return prisma.trendReference.create({ data: { clientId, ...d } });
}
export async function updateReference(id: string, body: unknown) {
  const d = referenceSchema.partial().parse(body);
  return prisma.trendReference.update({ where: { id }, data: d });
}
export async function deleteReference(id: string) {
  await prisma.trendReference.delete({ where: { id } });
}

// ── Glossary ────────────────────────────────────────────────────────
export async function createGlossary(clientId: string, body: unknown) {
  await ensureClient(clientId);
  const d = glossarySchema.parse(body);
  return prisma.glossaryTerm.create({ data: { clientId, ...d } });
}
export async function updateGlossary(id: string, body: unknown) {
  const d = glossarySchema.partial().parse(body);
  return prisma.glossaryTerm.update({ where: { id }, data: d });
}
export async function deleteGlossary(id: string) {
  await prisma.glossaryTerm.delete({ where: { id } });
}

// Confirm an agent-proposed competitor/avatar (PENDING_CONFIRMATION → active).
export async function confirmCompetitor(id: string) {
  return prisma.competitor.update({ where: { id }, data: { status: 'CONFIRMED' } });
}
export async function confirmAvatar(id: string) {
  return prisma.avatar.update({ where: { id }, data: { status: 'ACTIVE' } });
}

export const _idParam = z.object({ id: z.string() });
