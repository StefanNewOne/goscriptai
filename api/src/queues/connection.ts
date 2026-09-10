import { Redis } from 'ioredis';
import { env } from '../env.js';

// BullMQ requires maxRetriesPerRequest: null on its connection.
export function makeRedis() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// Shared connection for the queue producers.
export const queueConnection = makeRedis();
