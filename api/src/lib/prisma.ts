import { PrismaClient } from '@prisma/client';

// Single Prisma client for the process. The domain layer never imports this
// (CLAUDE.md invariant 15) — only services do.
export const prisma = new PrismaClient();
