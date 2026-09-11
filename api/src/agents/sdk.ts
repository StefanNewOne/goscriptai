import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';

// The ONLY module that touches the Claude Agent SDK (CLAUDE.md invariant 15).
// Primary auth is Claude Max (Claude Code login on the server); ANTHROPIC_API_KEY
// is the automatic fallback. When neither is available we run in deterministic
// STUB mode so the whole product flow works in dev without a live session.

export function isStubMode(): boolean {
  // In production the Max login provides credentials even without an API key;
  // set AGENT_LIVE=1 to force live mode when Max is logged in on the server.
  return !env.ANTHROPIC_API_KEY && process.env.AGENT_LIVE !== '1';
}

export interface RunQueryInput {
  systemPrompt: string;
  prompt: string;
  model: string;
  sessionId?: string; // resume the same session (CLAUDE.md invariant 4)
  // JSON Schema — when set, the model returns validated structured JSON.
  schema?: Record<string, unknown>;
  maxTurns?: number;
}

export interface RunQueryResult {
  text: string;
  structured?: unknown; // populated when a schema was provided
  sessionId?: string;
  costUsd: number;
}

// Minimal shape of the SDK messages we depend on.
interface SdkResultMessage {
  type: string;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  session_id?: string;
  is_error?: boolean;
  error?: string; // on assistant messages: 'rate_limit' | 'overloaded' | ...
}

// Thrown on a 429/overload so BullMQ can pause the job WITHOUT consuming an
// attempt (CLAUDE.md invariant 3). Detected by code === 'RATE_LIMITED'.
function isRetryableModelError(e?: string): boolean {
  return e === 'rate_limit' || e === 'overloaded';
}

// Low-level single-turn (or resumed) agent call. Retry is BullMQ's job, so the
// SDK's own retries are disabled (ANTHROPIC_MAX_RETRIES=0). Agents reason over
// the context provided in the prompt; tool access is off by default (headless,
// no permission prompts) — enable per-agent later when web research is needed.
export async function runQuery(input: RunQueryInput): Promise<RunQueryResult> {
  let text = '';
  let structured: unknown;
  let costUsd = 0;
  let sessionId = input.sessionId;

  const iterator = query({
    prompt: input.prompt,
    options: {
      model: input.model,
      systemPrompt: input.systemPrompt,
      // Headroom so a model that thinks before emitting the structured result
      // doesn't hit error_max_turns (opus critic needs >1); no tools are enabled
      // (allowedTools: []), so there is no tool-call loop to run away.
      maxTurns: input.maxTurns ?? 8,
      permissionMode: 'bypassPermissions',
      allowedTools: [],
      ...(input.sessionId ? { resume: input.sessionId } : {}),
      ...(input.schema ? { outputFormat: { type: 'json_schema', schema: input.schema } } : {}),
    },
  });

  for await (const message of iterator) {
    const m = message as unknown as SdkResultMessage;
    if (m.session_id) sessionId = m.session_id;
    // Assistant-level transient errors (429/overload) → retryable pause.
    if (m.type === 'assistant' && isRetryableModelError(m.error)) {
      throw new AppError('RATE_LIMITED', 'Моделот е лимитиран; се паузира.');
    }
    if (m.type === 'result') {
      if (typeof m.total_cost_usd === 'number') costUsd = m.total_cost_usd;
      if (typeof m.result === 'string') text = m.result;
      if (m.structured_output !== undefined) structured = m.structured_output;
      if (m.is_error || (m.subtype && m.subtype !== 'success')) {
        throw new AppError('AGENT_FAILED', `Агентот падна (${m.subtype ?? 'error'}).`);
      }
    }
  }

  return { text, structured, sessionId, costUsd };
}

// Parse an agent's JSON output: prefer the SDK's validated structured_output,
// fall back to extracting a JSON object from the text (strips ```json fences).
export function parseAgentJson<T>(res: RunQueryResult): T {
  if (res.structured !== undefined && res.structured !== null) return res.structured as T;
  const text = res.text.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new AppError('AGENT_FAILED', 'Агентот не врати валиден JSON.');
  return JSON.parse(body.slice(start, end + 1)) as T;
}
