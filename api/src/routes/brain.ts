import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as brain from '../services/brainService.js';

const clientParam = z.object({ clientId: z.string() });
const idParam = z.object({ id: z.string() });

// Brain entity CRUD. All mutations require writer/admin; reads come via the
// client detail endpoint. RBAC is server-side (invariant 14).
export async function brainRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const write = { preHandler: [app.requireRole('SCRIPTWRITER', 'ADMIN')] };

  // Products
  app.post('/clients/:clientId/products', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createProduct(clientId, req.body) });
  });
  app.patch('/products/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateProduct(id, req.body) };
  });
  app.delete('/products/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteProduct(id);
    return { data: { ok: true } };
  });

  // Actors (clientId may be null for GoDigital talent)
  app.post('/clients/:clientId/actors', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createActor(clientId, req.body) });
  });
  app.post('/actors', write, async (req, reply) => {
    return reply.status(201).send({ data: await brain.createActor(null, req.body) });
  });
  app.patch('/actors/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateActor(id, req.body) };
  });
  app.delete('/actors/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteActor(id);
    return { data: { ok: true } };
  });

  // Locations
  app.post('/clients/:clientId/locations', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createLocation(clientId, req.body) });
  });
  app.patch('/locations/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateLocation(id, req.body) };
  });
  app.delete('/locations/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteLocation(id);
    return { data: { ok: true } };
  });

  // Competitors
  app.post('/clients/:clientId/competitors', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createCompetitor(clientId, req.body) });
  });
  app.patch('/competitors/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateCompetitor(id, req.body) };
  });
  app.post('/competitors/:id/confirm', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.confirmCompetitor(id) };
  });
  app.delete('/competitors/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteCompetitor(id);
    return { data: { ok: true } };
  });

  // References
  app.post('/clients/:clientId/references', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createReference(clientId, req.body) });
  });
  app.patch('/references/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateReference(id, req.body) };
  });
  app.delete('/references/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteReference(id);
    return { data: { ok: true } };
  });

  // Glossary
  app.post('/clients/:clientId/glossary', write, async (req, reply) => {
    const { clientId } = clientParam.parse(req.params);
    return reply.status(201).send({ data: await brain.createGlossary(clientId, req.body) });
  });
  app.patch('/glossary/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.updateGlossary(id, req.body) };
  });
  app.delete('/glossary/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    await brain.deleteGlossary(id);
    return { data: { ok: true } };
  });

  // Confirm an agent-proposed avatar
  app.post('/avatars/:id/confirm', write, async (req) => {
    const { id } = idParam.parse(req.params);
    return { data: await brain.confirmAvatar(id) };
  });
}
