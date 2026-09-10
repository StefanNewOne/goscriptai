import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { AuthUser } from '../plugins/auth.js';
import type { Role } from '../domain/types.js';

// Verify credentials and return the payload to sign. Never leak whether the
// email or the password was wrong.
export async function verifyCredentials(email: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('UNAUTHORIZED', 'Погрешен е-маил или лозинка.');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError('UNAUTHORIZED', 'Погрешен е-маил или лозинка.');
  return { id: user.id, role: user.role as Role, name: user.name };
}
