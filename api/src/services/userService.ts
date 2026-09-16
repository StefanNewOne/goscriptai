import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { Role } from '../domain/types.js';

// User administration (ADMIN only). passwordHash is NEVER selected/returned
// (defense against leaking it — mirrors the login path). No hard delete: users
// are referenced by sets/approvals, so removal would orphan the trail.
const SAFE = { id: true, name: true, email: true, role: true, notifyEmail: true, notifyTelegram: true, createdAt: true } as const;

export async function listUsers() {
  return prisma.user.findMany({ select: SAFE, orderBy: { createdAt: 'asc' } });
}

export async function createUser(input: { name: string; email: string; role: Role; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError('VALIDATION_FAILED', 'Корисник со тој е-маил веќе постои.');
  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({ data: { name: input.name, email: input.email, role: input.role, passwordHash }, select: SAFE });
}

export async function updateUserRole(id: string, role: Role, actingUserId: string) {
  // Guard against self-lockout: an admin can't strip their own role.
  if (id === actingUserId) throw new AppError('VALIDATION_FAILED', 'Не можеш да си ја смениш сопствената улога.');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('NOT_FOUND', 'Корисникот не постои.');
  return prisma.user.update({ where: { id }, data: { role }, select: SAFE });
}

export async function resetPassword(id: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('NOT_FOUND', 'Корисникот не постои.');
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return { ok: true };
}
