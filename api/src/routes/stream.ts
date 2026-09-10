import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { subscribe } from '../events/bus.js';
import type { AuthUser } from '../plugins/auth.js';

// SSE stream for one entity. EventSource cannot set headers, so the JWT comes as
// a query param and is verified here. One Redis subscription per open connection.
export async function streamRoutes(app: FastifyInstance) {
  app.get('/stream/:scope/:id', async (req, reply) => {
    const { scope, id } = z.object({ scope: z.enum(['client', 'set']), id: z.string() }).parse(req.params);
    const parsedQuery = z.object({ token: z.string().min(1) }).safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Потребна е најава.' } });
    }
    try {
      await app.jwt.verify<AuthUser>(parsedQuery.data.token);
    } catch {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Потребна е најава.' } });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(`event: ping\ndata: {}\n\n`);

    const unsub = subscribe(scope, id, (e) => {
      reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    });

    const ping = setInterval(() => reply.raw.write(`event: ping\ndata: {}\n\n`), 25_000);

    req.raw.on('close', () => {
      clearInterval(ping);
      void unsub();
    });
  });
}
