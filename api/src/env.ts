import { z } from 'zod';

// Zod-validated environment. Fails hard at boot on a missing required value
// (CLAUDE.md invariant 13). No defaults in code for required secrets.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Anthropic: Max is primary (CLI login), API key is the automatic fallback.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).default(0),

  // Voyage AI embeddings for semantic script search (optional — text search is
  // the fallback when unset). Model is multilingual for MK/SQ; 1024-dim.
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODEL: z.string().default('voyage-3.5'),

  SES_REGION: z.string().optional(),
  SES_ACCESS_KEY_ID: z.string().optional(),
  SES_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  META_LONG_LIVED_TOKEN: z.string().optional(),

  DEFAULT_CLIENT_BUDGET_USD: z.coerce.number().positive().default(50),
  DEFAULT_SET_BUDGET_USD: z.coerce.number().positive().default(8),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
     
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();

// Retry is BullMQ's job, not the SDK's (CLAUDE.md invariant 3). Propagate the
// value to process.env so the Agent SDK actually sees ANTHROPIC_MAX_RETRIES=0.
process.env.ANTHROPIC_MAX_RETRIES = String(env.ANTHROPIC_MAX_RETRIES);
