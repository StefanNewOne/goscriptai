import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Role } from '../domain/types.js';
import { AppError } from '../lib/errors.js';

// JWT payload carried in the Bearer token.
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authUser: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

// RBAC is server-side, never a UI concern (CLAUDE.md invariant 14).
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      const payload = await req.jwtVerify<AuthUser>();
      req.authUser = payload;
    } catch {
      throw new AppError('UNAUTHORIZED', 'Потребна е најава.');
    }
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: FastifyRequest) => {
      if (!req.authUser) {
        throw new AppError('UNAUTHORIZED', 'Потребна е најава.');
      }
      if (!roles.includes(req.authUser.role)) {
        throw new AppError('FORBIDDEN', 'Немаш дозвола за оваа акција.');
      }
    };
  });
});
