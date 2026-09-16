import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as users from '../services/userService.js';

// User administration (ADMIN only) — list, create, change role, reset password.
const roleEnum = z.enum(['SCRIPTWRITER', 'ADMIN', 'VIEWER']);

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const admin = { preHandler: [app.requireRole('ADMIN')] };

  app.get('/users', admin, async () => ({ data: await users.listUsers() }));

  app.post('/users', admin, async (req, reply) => {
    const body = z.object({ name: z.string().min(1), email: z.string().email(), role: roleEnum, password: z.string().min(6) }).parse(req.body);
    return reply.status(201).send({ data: await users.createUser(body) });
  });

  app.patch('/users/:id/role', admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { role } = z.object({ role: roleEnum }).parse(req.body);
    return { data: await users.updateUserRole(id, role, req.authUser.id) };
  });

  app.post('/users/:id/reset-password', admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    return { data: await users.resetPassword(id, password) };
  });
}
