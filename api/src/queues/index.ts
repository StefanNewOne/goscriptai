import { Queue, Worker, type Job } from 'bullmq';
import { queueConnection, makeRedis } from './connection.js';
import { runOnboardingJob, type OnboardingJob } from './workers/onboarding.js';
import { runSetJob, type SetJob } from './workers/setFlow.js';
import { AppError } from '../lib/errors.js';

const RATE_LIMIT_PAUSE_MS = 30_000;

// Wrap a processor so a 429/overload pauses the job WITHOUT consuming an
// attempt (CLAUDE.md invariant 3); all other errors go through normal retries.
function withRateLimit<T>(worker: () => Worker, run: (data: T) => Promise<void>) {
  return async (job: Job<T>) => {
    try {
      await run(job.data);
    } catch (err) {
      if (err instanceof AppError && err.code === 'RATE_LIMITED') {
        await worker().rateLimit(RATE_LIMIT_PAUSE_MS);
        throw Worker.RateLimitError();
      }
      throw err;
    }
  };
}

// Retry is BullMQ's job (invariant 3): 3 attempts, exponential backoff.
export const BRAIN_QUEUE = 'brain';
export const SET_QUEUE = 'set';

const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export const brainQueue = new Queue<OnboardingJob>(BRAIN_QUEUE, { connection: queueConnection, defaultJobOptions: jobOptions });
export const setQueue = new Queue<SetJob>(SET_QUEUE, { connection: queueConnection, defaultJobOptions: jobOptions });

let workers: Worker[] = [];

// Workers run in-process for dev simplicity; in production they can move to a
// separate process using the same registration.
export function registerWorkers() {
  if (workers.length) return;
  // The processors reference their own worker (for rateLimit) via a late-bound getter.
  let brainWorker!: Worker<OnboardingJob>;
  let setWorker!: Worker<SetJob>;
  brainWorker = new Worker<OnboardingJob>(BRAIN_QUEUE, withRateLimit<OnboardingJob>(() => brainWorker, runOnboardingJob), { connection: makeRedis(), concurrency: 4 });
  setWorker = new Worker<SetJob>(SET_QUEUE, withRateLimit<SetJob>(() => setWorker, runSetJob), { connection: makeRedis(), concurrency: 4 });

  // On final failure (attempts exhausted) move the set to FAILED so it never
  // stays stuck in a *_RUNNING status; a manual retry resets it (invariant 3/10).
  setWorker.on('failed', (job, _err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const setId = (job.data as { setId?: string }).setId;
    if (!setId) return;
    void import('../services/setService.js').then(({ failSet }) => failSet(setId).catch(() => {}));
  });

  workers.push(brainWorker, setWorker);
}

export async function closeQueues() {
  await Promise.all(workers.map((w) => w.close()));
  await brainQueue.close();
  await setQueue.close();
  workers = [];
}
