import type { FastifyInstance } from 'fastify';
import { loginSchema } from '../schemas/auth.js';
import { verifyCredentials } from '../services/authService.js';

// Routes are thin: validate → service → respond (CLAUDE.md conventions).
export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await verifyCredentials(email, password);
    const token = app.jwt.sign(user);
    return reply.send({ data: { token, user } });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { data: { user: req.authUser } };
  });
}
